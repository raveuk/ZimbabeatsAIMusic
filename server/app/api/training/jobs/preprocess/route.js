// POST /api/training/jobs/preprocess — spawns convert2hf_dataset.py over a
// saved dataset directory, producing the HF dataset that trainer.py reads.
//
// Body: { datasetId? | datasetName?, repeatCount?, outputDir? }
// Output dir defaults to {datasetDir}_hf next to the source dataset.
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../../lib/api.js";
import { db } from "../../../../../lib/db.js";
import {
  spawnTrainerJob, ACE_STEP_DIR, publicLoraJob,
} from "../../../../../lib/training.js";
import { writeDatasetToDisk, defaultSettings } from "../../../../../lib/training_storage.js";

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));

  // Resolve which dataset row + on-disk dir.
  let row;
  if (body.datasetId) {
    row = db.prepare("SELECT * FROM lora_datasets WHERE id = ? AND user_id = ?")
      .get(Number(body.datasetId), user.id);
  } else if (body.datasetName) {
    row = db.prepare("SELECT * FROM lora_datasets WHERE name = ? AND user_id = ?")
      .get(String(body.datasetName), user.id);
  }
  if (!row) return json({ error: "dataset not found" }, 404);

  const dir = row.dataset_path;
  if (!dir || !fs.existsSync(dir)) {
    return json({ error: "dataset directory missing — re-save the dataset first" }, 410);
  }

  // Ensure the ACE-Step .txt files are flushed to disk (re-flush is cheap +
  // idempotent — protects against the user editing samples in the table but
  // not pressing Save before Preprocess).
  let samples = [];
  let settings = defaultSettings(row.name);
  try { samples = JSON.parse(row.samples_json || "[]"); } catch {}
  try { settings = { ...settings, ...JSON.parse(row.settings_json || "{}") }; } catch {}
  if (!samples.length) return json({ error: "no samples in dataset" }, 400);
  writeDatasetToDisk(dir, { samples, settings });

  // Refuse a second preprocess while one is already running for this user.
  const conflict = db.prepare(
    "SELECT id FROM lora_jobs WHERE user_id = ? AND kind = 'preprocess' AND status = 'running'"
  ).get(user.id);
  if (conflict) return json({ error: "a preprocess job is already running", jobId: conflict.id }, 429);

  // Output dir: {sourceDir}_hf next to the dataset. Trainer can read it via --dataset_path.
  const outputDir = String(body.outputDir || `${dir}_hf`);
  // Avoid clobbering an existing dir — convert2hf_dataset can choke on stale
  // contents; if the user explicitly wants a re-run, wipe first.
  if (fs.existsSync(outputDir) && body.force) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  const repeatCount = Number.isFinite(Number(body.repeatCount)) && Number(body.repeatCount) > 0
    ? Math.floor(Number(body.repeatCount)) : 200;

  const args = [
    path.join(ACE_STEP_DIR, "convert2hf_dataset.py"),
    "--data_dir", dir,
    "--repeat_count", String(repeatCount),
    "--output_name", outputDir,
  ];
  const params = { datasetId: row.id, datasetName: row.name, sourceDir: dir, outputDir, repeatCount };
  const { jobId, pid, logPath } = spawnTrainerJob({
    userId: user.id, datasetId: row.id, kind: "preprocess",
    name: `preprocess: ${row.name}`, params, args,
  });
  // Record the planned output so the poll endpoint can surface it on completion.
  db.prepare("UPDATE lora_jobs SET tensor_path = ? WHERE id = ?").run(outputDir, jobId);

  const fresh = db.prepare("SELECT * FROM lora_jobs WHERE id = ?").get(jobId);
  return json({ jobId, pid, logPath, job: publicLoraJob(fresh) });
});
