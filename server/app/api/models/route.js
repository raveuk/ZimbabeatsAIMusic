import fs from "node:fs";
import path from "node:path";
import { json, handler } from "../../../lib/api.js";
import { MODEL_FILES } from "../../../lib/workflow.js";

// Inspects the live ACE-Step workflow + cover workflow and reports every
// model file they currently reference. The UI can populate dropdowns from
// this so users see what is *actually* being used (no more hardcoded lists
// that drift away from server-side reality).
//
// Shape:
//   { lmModels: [{ id, file, role, label }], unetModels: [...], coverModels: [...] }
//
// `id` is a stable slug derived from the filename, so the frontend can store
// it in localStorage without worrying about path changes.
function slug(file) {
  return file.replace(/\.safetensors$/i, "").replace(/[^a-z0-9_]+/gi, "_");
}

// Human label — translates the technical filename into a UI-facing string.
// Format is "<size/spec> <qualitative>" (e.g. "4B Best") so users see both
// the engine spec they might recognise AND the quick quality hint. The
// underlying engine names ("qwen", "acestep") never leak.
function labelFor(file) {
  const lower = file.toLowerCase();
  // Lyric/tags encoders (DualCLIPLoader)
  if (lower.includes("qwen_0.6b") || lower.includes("qwen_0_6b")) return "0.6B Fast";
  if (lower.includes("qwen_1.7b") || lower.includes("qwen_1_7b")) return "1.7B Standard";
  if (lower.includes("qwen_4b"))                                  return "4B Best";
  // UNET diffusion models
  if (lower.includes("xl_sft"))     return "Studio (Best)";
  if (lower.includes("xl_turbo"))   return "Turbo XL";
  if (lower.includes("xl_base"))    return "XL Base";
  if (lower.includes("v1.5_turbo")) return "1.5v Turbo";
  if (lower.includes("v1.5_base") || lower.includes("v1.5") || lower.includes("v1_5")) return "1.5v Base";
  // Cover-art checkpoints
  if (lower.includes("juggernaut")) return "Juggernaut XL (Photoreal)";
  if (lower.includes("sd_xl_base")) return "SDXL Base";
  // Fallback: strip extension + known prefixes; never leak "qwen" / "acestep".
  return file
    .replace(/\.safetensors$/i, "")
    .replace(/^acestep[_-]v?1\.5[_-]?/i, "")
    .replace(/^qwen[_-]/i, "")
    .replace(/_/g, " ")
    .trim() || "Default";
}

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf8")); }
  catch { return null; }
}

export const GET = handler(async () => {
  const audio = loadJSON("workflow.api.json") || {};
  const cover = loadJSON("workflow.cover.api.json") || {};

  const lmModels = [];
  const coverModels = [];

  for (const node of Object.values(audio)) {
    if (node?.class_type === "DualCLIPLoader") {
      const c1 = node.inputs?.clip_name1;
      const c2 = node.inputs?.clip_name2;
      if (c1) lmModels.push({ id: slug(c1), file: c1, role: "tags",   label: labelFor(c1) });
      if (c2) lmModels.push({ id: slug(c2), file: c2, role: "lyrics", label: labelFor(c2) });
    }
  }
  for (const node of Object.values(cover)) {
    if (node?.class_type === "CheckpointLoaderSimple") {
      const c = node.inputs?.ckpt_name;
      if (c) coverModels.push({ id: slug(c), file: c, label: labelFor(c) });
    }
  }

  // UNET options come from MODEL_FILES (the runtime switch table) — not from
  // the workflow JSON, which only carries the default. ids match what the
  // frontend already sends as `ditModel` (studio / turbo / …).
  const unetModels = Object.entries(MODEL_FILES).map(([id, file]) => ({
    id,
    file,
    label: labelFor(file),
  }));

  return json({ lmModels, unetModels, coverModels });
});
