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

// Human label: pull the parameter-size hint out of the filename when present
// (qwen_4b_ace15 -> "4B", acestep_v1.5_xl_sft_bf16 -> "XL SFT bf16").
function labelFor(file) {
  const base = file.replace(/\.safetensors$/i, "");
  const m = base.match(/[_-]([0-9]+(?:\.[0-9]+)?[bm])(?:[_-]|$)/i);
  if (m) return m[1].toUpperCase();
  return base
    .replace(/^acestep[_-]v?1\.5[_-]?/i, "")
    .replace(/^qwen[_-]/i, "")
    .replace(/_/g, " ")
    .trim();
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
