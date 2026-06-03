// POST /api/training/tensors/load — the UI's "Load Preprocessed Tensors"
// button. Validates the supplied path exists and looks like a
// convert2hf_dataset.py output (has a `dataset_info.json` or directory
// structure typical of HuggingFace datasets), then echoes back the abs
// path + size so the Train tab knows what to feed trainer.py.
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../../lib/api.js";
import { safePathUnderDatasetsRoot } from "../../../../../lib/training.js";

function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else {
        try { total += fs.statSync(p).size; } catch {}
      }
    }
  }
  return total;
}

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const rel = String(body.tensorDir || body.path || "");
  if (!rel) return json({ error: "tensorDir required" }, 400);

  // Tensor dirs land under server/data/datasets/u{u}/... — same per-user
  // root the dataset save path uses.
  let abs;
  try { abs = safePathUnderDatasetsRoot(user.id, rel); }
  catch (e) { return json({ error: e.message || "invalid path" }, 400); }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    return json({ error: `tensor dir not found: ${rel}` }, 404);
  }
  // Soft sanity check — most HF datasets dump dataset_info.json next to
  // shards. We don't hard-fail if it's absent (custom layouts exist).
  const looksLikeHF = fs.existsSync(path.join(abs, "dataset_info.json"))
    || fs.readdirSync(abs).some((f) => /\.arrow$/.test(f));
  return json({
    ok: true,
    tensorDir: abs,
    size: dirSize(abs),
    looksLikeHF,
    status: `Loaded tensor dir: ${path.basename(abs)}`,
  });
});
