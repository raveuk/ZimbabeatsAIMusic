// LoRA training helpers — orchestrates Python child processes for the
// upstream ACE-Step training repo (convert2hf_dataset.py / trainer.py).
//
// The backend is in dev mode (Next.js `npm run dev`), which restarts on
// file changes — to make trainer jobs survive a restart, every child is
// spawned `detached: true` and the lora_jobs row records its pid. On any
// reconnect we check `kill(pid, 0)` to decide whether the job is still
// alive. Log parsing happens lazily, only when the API polls the job.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "./db.js";

const SERVER_ROOT = process.cwd();
export const DATA_DIR = path.join(SERVER_ROOT, "data");
export const DATASETS_ROOT = path.join(DATA_DIR, "datasets");
export const TENSORS_ROOT  = path.join(DATA_DIR, "tensors");
export const LORA_JOBS_LOG_DIR = path.join(DATA_DIR, "lora_jobs");
fs.mkdirSync(DATASETS_ROOT, { recursive: true });
fs.mkdirSync(TENSORS_ROOT,  { recursive: true });
fs.mkdirSync(LORA_JOBS_LOG_DIR, { recursive: true });

export const ACE_STEP_DIR  = process.env.ACE_STEP_DIR  || "/home/raveuk/ai-training/ace-step";
export const ACE_STEP_PY   = process.env.ACE_STEP_PY   || path.join(ACE_STEP_DIR, ".venv", "bin", "python");
export const COMFY_LORAS_DIR = path.join(process.env.COMFYUI_ROOT || "/home/raveuk/comfy/ComfyUI", "models", "loras");

// "music_app" or "music-app" → "music_app". Used for filenames.
export function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

// Resolve a user-supplied relative path against the per-user datasets root.
// Rejects paths that escape via `..` or symlink targets outside the root.
export function safePathUnderDatasetsRoot(userId, relPath) {
  const userRoot = path.join(DATASETS_ROOT, `u${userId}`);
  fs.mkdirSync(userRoot, { recursive: true });
  const rel = String(relPath || "").trim();
  if (!rel) return userRoot; // empty means the root itself
  const resolved = path.resolve(userRoot, rel);
  const userRootResolved = fs.realpathSync(userRoot);
  // Resolve only the parent (target may not exist yet for writes); ensure it stays under root.
  const parent = path.dirname(resolved);
  let parentResolved;
  try { parentResolved = fs.realpathSync(parent); } catch { parentResolved = parent; }
  if (parentResolved !== userRootResolved && !parentResolved.startsWith(userRootResolved + path.sep)) {
    const err = new Error("path escapes the per-user dataset root");
    err.status = 400;
    throw err;
  }
  return resolved;
}

// Spawn the ACE-Step Python child in its own session so it outlives the
// Next.js dev hot-reload. Returns { jobId, pid, logPath } after the row
// is inserted; the caller's API handler returns immediately.
//
// args is an array of strings (already shell-escaped by spawn).
// env is a flat object merged onto process.env for the child.
export function spawnTrainerJob({ userId, datasetId, kind, name, params, args, env = {} }) {
  if (!fs.existsSync(ACE_STEP_PY)) {
    const err = new Error(`ACE-Step Python venv missing at ${ACE_STEP_PY}`);
    err.status = 500;
    throw err;
  }
  const stmt = db.prepare(
    `INSERT INTO lora_jobs (user_id, dataset_id, name, kind, params_json, status)
     VALUES (?, ?, ?, ?, ?, 'running')`
  );
  const info = stmt.run(userId, datasetId ?? null, name, kind, JSON.stringify(params));
  const jobId = Number(info.lastInsertRowid);
  const logPath = path.join(LORA_JOBS_LOG_DIR, `${jobId}.log`);
  const logFd = fs.openSync(logPath, "a");

  const child = spawn(ACE_STEP_PY, args, {
    cwd: ACE_STEP_DIR,
    env: { ...process.env, PYTHONUNBUFFERED: "1", ...env },
    stdio: ["ignore", logFd, logFd],
    detached: true,
  });
  // Detach so the child outlives Next.js dev restarts.
  child.unref();
  fs.closeSync(logFd);

  db.prepare("UPDATE lora_jobs SET pid = ?, log_path = ? WHERE id = ?").run(child.pid, logPath, jobId);

  // Wire an exit watcher just for this process lifetime. On Next dev
  // reload the watcher dies but `refreshLoraJob` reattaches via pid check.
  child.on("exit", (code) => {
    const status = code === 0 ? "done" : "error";
    db.prepare("UPDATE lora_jobs SET status = ? WHERE id = ? AND status = 'running'").run(status, jobId);
  });

  return { jobId, pid: child.pid, logPath };
}

// Best-effort liveness check without raising.
export function isProcessAlive(pid) {
  if (!pid) return false;
  try { process.kill(Number(pid), 0); return true; }
  catch (e) { return false; }
}

// Parse a single line of trainer stdout into structured progress fields.
// PyTorch Lightning's progress bar (tqdm-style) emits:
//   "Epoch 0:  10%|██  | 200/2000 [01:23<12:30,  2.40it/s, loss=0.124]"
// We pull current_step / total_steps from the "200/2000" fragment and the
// last "loss=0.124" fragment as the latest loss.
const RE_STEP   = /(\d+)\s*\/\s*(\d+)\s*\[/;
const RE_LOSS   = /loss\s*[:=]\s*([0-9.eE+\-]+)/i;
const RE_GLOBAL = /global[_ ]step[:=]\s*(\d+)/i;
export function parseLogLine(line) {
  const out = {};
  const step = line.match(RE_STEP);
  if (step) {
    out.current_step = parseInt(step[1], 10);
    out.total_steps  = parseInt(step[2], 10);
  } else {
    const g = line.match(RE_GLOBAL);
    if (g) out.current_step = parseInt(g[1], 10);
  }
  const loss = line.match(RE_LOSS);
  if (loss) {
    const v = parseFloat(loss[1]);
    if (Number.isFinite(v)) out.last_loss = v;
  }
  return out;
}

// Tail the last `bytes` of a log file. Used for both API responses (so
// the UI can show a live log stream) and for progress parsing.
export function tailLog(logPath, bytes = 32 * 1024) {
  if (!logPath || !fs.existsSync(logPath)) return "";
  const stat = fs.statSync(logPath);
  const start = Math.max(0, stat.size - bytes);
  const fd = fs.openSync(logPath, "r");
  try {
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

// Look at the current state of a lora_jobs row + its log file and
// reconcile. Updates the row in place. Returns the updated row.
export function refreshLoraJob(row) {
  if (!row) return null;
  if (row.status === "done" || row.status === "error" || row.status === "cancelled") {
    return row;
  }
  const alive = isProcessAlive(row.pid);

  // Parse the log for the latest progress + loss.
  const log = tailLog(row.log_path, 64 * 1024);
  const lines = log.split(/\r?\n/);
  let latest = {};
  // Walk from the end; pick the last line that yields a parse.
  for (let i = lines.length - 1; i >= 0; i--) {
    const p = parseLogLine(lines[i]);
    if (p.current_step != null || p.last_loss != null) {
      latest = { ...p, ...latest };
      if (latest.current_step != null && latest.last_loss != null) break;
    }
  }

  const fields = [];
  const vals = [];
  if (latest.current_step != null) { fields.push("current_step = ?"); vals.push(latest.current_step); }
  if (latest.total_steps  != null) { fields.push("total_steps  = ?"); vals.push(latest.total_steps);  }
  if (latest.last_loss    != null) { fields.push("last_loss    = ?"); vals.push(latest.last_loss);    }
  if (!alive && row.status === "running") {
    // Process exited. We can't always know the exit code from a different
    // process tree — best-effort: if the log ends with a trace, mark error;
    // otherwise mark done. Caller can refine if needed.
    const errored = /Traceback \(most recent|Error:|RuntimeError|CUDA out of memory/.test(log);
    fields.push("status = ?");
    vals.push(errored ? "error" : "done");
    if (errored) {
      fields.push("error_message = ?");
      const tail = lines.slice(-20).join("\n");
      vals.push(tail.slice(-800));
    }
  }
  if (fields.length) {
    vals.push(row.id);
    db.prepare(`UPDATE lora_jobs SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
  }
  return db.prepare("SELECT * FROM lora_jobs WHERE id = ?").get(row.id);
}

// Public row shape for the API: omit raw pid + log_path, surface a
// compact log tail for the UI.
export function publicLoraJob(row, { withLog = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    datasetId: row.dataset_id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    currentStep: row.current_step ?? 0,
    totalSteps:  row.total_steps  ?? 0,
    lastLoss:    row.last_loss ?? null,
    percent: (row.total_steps && row.total_steps > 0)
      ? Math.min(100, Math.round((row.current_step / row.total_steps) * 100))
      : null,
    tensorPath:    row.tensor_path ?? null,
    loraFilename:  row.lora_filename ?? null,
    errorMessage:  row.error_message ?? null,
    createdAt:     row.created_at,
    logTail:       withLog ? tailLog(row.log_path, 4 * 1024) : undefined,
  };
}

// SIGTERM the child, escalate to SIGKILL after 8s if still alive.
export async function cancelLoraJob(row) {
  if (!row || !row.pid) return false;
  try { process.kill(row.pid, "SIGTERM"); } catch {}
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && isProcessAlive(row.pid)) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (isProcessAlive(row.pid)) {
    try { process.kill(row.pid, "SIGKILL"); } catch {}
  }
  db.prepare("UPDATE lora_jobs SET status = 'cancelled' WHERE id = ? AND status IN ('running','queued')").run(row.id);
  return true;
}

// Move the trainer's saved checkpoint (.ckpt / .safetensors) into ComfyUI's
// models/loras dir so LoraLoaderModelOnly can find it. Returns the final
// basename or null on failure.
export function exportLoraToComfyDir({ jobId, userId, name, srcAbsPath }) {
  if (!fs.existsSync(srcAbsPath)) return null;
  fs.mkdirSync(COMFY_LORAS_DIR, { recursive: true });
  const ext = path.extname(srcAbsPath) || ".safetensors";
  const dest = path.join(COMFY_LORAS_DIR, `lora_u${userId}_j${jobId}_${slugify(name)}${ext}`);
  fs.copyFileSync(srcAbsPath, dest);
  return path.basename(dest);
}
