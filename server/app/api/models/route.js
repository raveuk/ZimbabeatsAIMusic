import fs from "node:fs";
import path from "node:path";
import { json, handler } from "../../../lib/api.js";

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

// Human label — translates the technical filename into a brand-neutral name
// the user sees in the picker. Hides "qwen", parameter counts, and quant
// suffixes. Updated this table when adding new models so the UI stays clean.
function labelFor(file) {
  const lower = file.toLowerCase();
  // Lyric/tags encoders (DualCLIPLoader)
  if (lower.includes("qwen_0.6b") || lower.includes("qwen_0_6b")) return "Fast";
  if (lower.includes("qwen_1.7b") || lower.includes("qwen_1_7b")) return "Standard";
  if (lower.includes("qwen_4b"))                                  return "Best";
  // UNET diffusion models
  if (lower.includes("xl_sft"))     return "Studio (Best)";
  if (lower.includes("xl_turbo"))   return "Turbo XL";
  if (lower.includes("xl_base"))    return "XL Base";
  if (lower.includes("v1.5_turbo")) return "Turbo";
  if (lower.includes("v1.5_base") || lower.includes("v1.5") || lower.includes("v1_5")) return "Base";
  // Cover-art checkpoints
  if (lower.includes("juggernaut")) return "Juggernaut (Photoreal)";
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
  const unetModels = [];
  const coverModels = [];

  for (const node of Object.values(audio)) {
    if (node?.class_type === "DualCLIPLoader") {
      const c1 = node.inputs?.clip_name1;
      const c2 = node.inputs?.clip_name2;
      if (c1) lmModels.push({ id: slug(c1), file: c1, role: "tags",   label: labelFor(c1) });
      if (c2) lmModels.push({ id: slug(c2), file: c2, role: "lyrics", label: labelFor(c2) });
    }
    if (node?.class_type === "UNETLoader") {
      const u = node.inputs?.unet_name;
      if (u) unetModels.push({ id: slug(u), file: u, label: labelFor(u) });
    }
  }
  for (const node of Object.values(cover)) {
    if (node?.class_type === "CheckpointLoaderSimple") {
      const c = node.inputs?.ckpt_name;
      if (c) coverModels.push({ id: slug(c), file: c, label: labelFor(c) });
    }
  }

  return json({ lmModels, unetModels, coverModels });
});
