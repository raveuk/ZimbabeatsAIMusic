// POST /api/training/jobs/train — spawns trainer.py against a preprocessed
// HF dataset directory. Long-running (15-180 min). Fire-and-forget; the
// per-job poll endpoint returns status + step counter + last loss.
//
// Body: {
//   datasetId? | datasetName?,
//   tensorDir?: string,    // override the preprocess output (defaults to the row's tensor_path)
//   name?: string,         // exp_name + final LoRA basename
//   hyperparams: {
//     rank?, alpha?, dropout?, learningRate?, epochs?, batchSize?,
//     gradientAccumulation?, saveEvery?, shift?, seed?,
//     resumeCheckpoint?,
//     ckptPath?, loraConfigPath?, precision?, maxSteps?, gradientClipVal?, …
//   }
// }
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../../lib/api.js";
import { db } from "../../../../../lib/db.js";
import {
  spawnTrainerJob, ACE_STEP_DIR, publicLoraJob, slugify, DATASETS_ROOT,
} from "../../../../../lib/training.js";

function pickInt(v, def, min = 1, max = 10_000_000) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
}
function pickFloat(v, def, min = 0, max = 10) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
}

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const hp = body.hyperparams || {};

  // LoRA training quota — refuse beyond the user's lora_quota.
  if (user.lora_quota != null) {
    const done = db.prepare("SELECT COUNT(*) AS n FROM lora_jobs WHERE user_id = ? AND kind = 'train' AND status = 'done'")
      .get(user.id);
    if (done.n >= user.lora_quota) {
      return json({ error: `LoRA training quota reached (${done.n}/${user.lora_quota})` }, 403);
    }
  }

  // Single concurrent training per user.
  const conflict = db.prepare(
    "SELECT id FROM lora_jobs WHERE user_id = ? AND kind = 'train' AND status = 'running'"
  ).get(user.id);
  if (conflict) return json({ error: "another training job is already running", jobId: conflict.id }, 429);

  // Resolve dataset row + tensor dir.
  let datasetRow = null;
  if (body.datasetId) {
    datasetRow = db.prepare("SELECT * FROM lora_datasets WHERE id = ? AND user_id = ?")
      .get(Number(body.datasetId), user.id);
  } else if (body.datasetName) {
    datasetRow = db.prepare("SELECT * FROM lora_datasets WHERE name = ? AND user_id = ?")
      .get(String(body.datasetName), user.id);
  }

  // Tensor dir = body.tensorDir (UI's Load Tensors) OR the last successful
  // preprocess for this user/dataset.
  let tensorDir = body.tensorDir ? String(body.tensorDir) : null;
  if (!tensorDir && datasetRow) {
    const pre = db.prepare(
      "SELECT * FROM lora_jobs WHERE user_id = ? AND dataset_id = ? AND kind = 'preprocess' AND status = 'done' ORDER BY id DESC LIMIT 1"
    ).get(user.id, datasetRow.id);
    if (pre?.tensor_path) tensorDir = pre.tensor_path;
  }
  if (!tensorDir || !fs.existsSync(tensorDir)) {
    return json({ error: "tensorDir missing or not preprocessed yet" }, 400);
  }

  const name = String(body.name || datasetRow?.name || `lora_${Date.now()}`);
  const expName = slugify(name) || `lora_u${user.id}_${Date.now()}`;

  // Resolve LoRA config path:
  //   1. explicit ckptPath/loraConfigPath in body
  //   2. ACE_STEP_DIR/config/zh_rap_lora_config.json (the upstream default)
  const loraConfigPath = String(
    hp.loraConfigPath || body.loraConfigPath ||
    path.join(ACE_STEP_DIR, "config", "zh_rap_lora_config.json"),
  );
  if (!fs.existsSync(loraConfigPath)) {
    return json({ error: `LoRA config missing: ${loraConfigPath}` }, 400);
  }

  // Trainer args mapped from the UI's hyperparams.
  // Output checkpoints live in a per-job dir we own — easier to find the
  // final .safetensors at export time than letting Lightning pick a path.
  const userRoot = path.join(DATASETS_ROOT, `u${user.id}`);
  fs.mkdirSync(userRoot, { recursive: true });
  const ckptDir = path.join(userRoot, "_train", expName, "ckpts");
  const logDir  = path.join(userRoot, "_train", expName, "logs");
  fs.mkdirSync(ckptDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const args = [
    path.join(ACE_STEP_DIR, "trainer.py"),
    "--dataset_path", tensorDir,
    "--exp_name", expName,
    "--learning_rate", String(pickFloat(hp.learningRate, 1e-4, 1e-7, 1)),
    "--epochs", String(pickInt(hp.epochs, -1, -1, 100_000)),
    "--max_steps", String(pickInt(hp.maxSteps, 2_000_000, 1, 100_000_000)),
    "--every_n_train_steps", String(pickInt(hp.saveEvery, 2000, 1, 1_000_000)),
    "--shift", String(pickFloat(hp.shift, 3.0, 0.1, 10)),
    "--accumulate_grad_batches", String(pickInt(hp.gradientAccumulation, 1, 1, 256)),
    "--precision", String(hp.precision || "bf16-mixed"),
    "--devices", String(pickInt(hp.devices, 1, 1, 8)),
    "--checkpoint_dir", ckptDir,
    "--logger_dir", logDir,
    "--lora_config_path", loraConfigPath,
  ];
  if (hp.resumeCheckpoint) args.push("--ckpt_path", String(hp.resumeCheckpoint));

  const params = {
    name, expName, tensorDir, ckptDir, logDir, loraConfigPath,
    hyperparams: hp,
  };
  const { jobId, pid, logPath } = spawnTrainerJob({
    userId: user.id, datasetId: datasetRow?.id || null,
    kind: "train", name, params, args,
  });
  // Pre-populate total_steps from hyperparams so the UI bar shows a target
  // even before the first log line arrives.
  const totalSteps = pickInt(hp.maxSteps, 2_000_000, 1, 100_000_000);
  db.prepare("UPDATE lora_jobs SET total_steps = ?, tensor_path = ? WHERE id = ?")
    .run(totalSteps, tensorDir, jobId);

  const fresh = db.prepare("SELECT * FROM lora_jobs WHERE id = ?").get(jobId);
  return json({ jobId, pid, logPath, job: publicLoraJob(fresh) });
});
