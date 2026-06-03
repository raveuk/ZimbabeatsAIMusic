// POST /api/training/jobs/[id]/export — locate the trainer's final
// .safetensors LoRA in the job's checkpoint dir, copy it into
// ComfyUI/models/loras/ so LoraLoaderModelOnly can find it, and stamp
// the lora_jobs row with the resulting filename so the Trained list +
// CreatePanel picker can both surface it.
//
// Body: { outputDir? } — caller can override where to look (rare).
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../../../lib/api.js";
import { db } from "../../../../../../lib/db.js";
import { exportLoraToComfyDir, publicLoraJob } from "../../../../../../lib/training.js";

// Find the freshest .safetensors anywhere under `dir` (recursive). PyTorch
// Lightning saves each checkpoint as a directory named like
// `epoch=0-step=2000_lora/` containing adapter_model.safetensors — we pick
// whichever .safetensors has the latest mtime.
function findLatestSafetensors(dir) {
  let best = null, bestMtime = 0;
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith(".safetensors")) {
        const m = fs.statSync(p).mtimeMs;
        if (m > bestMtime) { bestMtime = m; best = p; }
      }
    }
  }
  return best;
}

export const POST = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const row = db.prepare("SELECT * FROM lora_jobs WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id);
  if (!row) return json({ error: "job not found" }, 404);
  if (row.kind !== "train") return json({ error: "only train jobs can be exported" }, 400);

  // Find the freshest .safetensors. Caller-supplied outputDir wins; else
  // the params_json's ckptDir (set by /jobs/train); else give up.
  let searchDir = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.outputDir) searchDir = String(body.outputDir);
  } catch {}
  if (!searchDir) {
    let params = {};
    try { params = JSON.parse(row.params_json || "{}"); } catch {}
    searchDir = params.ckptDir || null;
  }
  if (!searchDir) return json({ error: "no checkpoint dir on this job" }, 400);

  const src = findLatestSafetensors(searchDir);
  if (!src) return json({ error: `no .safetensors found under ${searchDir}` }, 404);

  const finalName = exportLoraToComfyDir({
    jobId: row.id, userId: user.id, name: row.name, srcAbsPath: src,
  });
  if (!finalName) return json({ error: "export failed (could not write to models/loras/)" }, 500);
  db.prepare("UPDATE lora_jobs SET lora_filename = ? WHERE id = ?").run(finalName, row.id);

  const fresh = db.prepare("SELECT * FROM lora_jobs WHERE id = ?").get(row.id);
  return json({ ok: true, loraFilename: finalName, job: publicLoraJob(fresh) });
});
