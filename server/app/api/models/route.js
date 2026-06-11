import fs from "node:fs";
import path from "node:path";
import { json, handler } from "../../../lib/api.js";
import { MODEL_FILES, cloneAvailable } from "../../../lib/workflow.js";

const COMFY_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

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
  // RVC voice models — TTS-Audio-Suite ships these as auto-downloads.
  // Engine name ("RVC") never leaks; users just see the voice handle.
  if (lower === "claire.pth")  return "Claire (Female)";
  if (lower === "fuji.pth")    return "Fuji (Female)";
  if (lower === "mae_v2.pth")  return "Mae (Female)";
  if (lower === "monika.pth")  return "Monika (Female)";
  if (lower === "sayano.pth")  return "Sayano (Female)";
  if (lower === "male_1.pth")  return "Generic Male";
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

  // RVC voices — only surfaced when the clone workflow is wired. We ask
  // ComfyUI's /object_info for the current LoadRVCModelNode dropdown so the
  // UI reflects whatever is locally downloaded + the auto-download set. A
  // failed fetch (Comfy down, custom node missing) just returns an empty list
  // and the UI hides the voice picker.
  // Artist/celebrity voices are LOCAL-TEST ONLY — gated behind an env flag so
  // the deployed backend never serves them (likeness/right-of-publicity risk on
  // a public commercial product). See sprint/2026-06-11_artist-voices.md.
  const artistVoicesEnabled = process.env.ENABLE_ARTIST_VOICES === "1";

  // Stock voices are "natural" (the two we treat as default-safe) or "character"
  // (the rest of the TTS-Audio-Suite set). Everything not in this map and not a
  // stock filename is treated as an artist voice — those only surface when the
  // flag is on. ComfyUI exposes artist models living under models/TTS/RVC/artists/
  // in the same flat LoadRVCModelNode dropdown, so we categorise by filename.
  const NATURAL = new Set(["claire.pth", "male_1.pth"]);
  const CHARACTER = new Set(["fuji.pth", "mae_v2.pth", "monika.pth", "sayano.pth"]);
  const categoryFor = (file) => {
    const lower = file.toLowerCase();
    if (NATURAL.has(lower)) return "natural";
    if (CHARACTER.has(lower)) return "character";
    return "artist"; // anything else is a user-supplied artist model
  };

  let voices = [];
  if (cloneAvailable()) {
    try {
      const r = await fetch(`${COMFY_URL}/object_info/LoadRVCModelNode`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        const choices = data?.LoadRVCModelNode?.input?.required?.model?.[0] || [];
        const seen = new Set();
        for (const c of choices) {
          // Strip the "local:" prefix Comfy adds for files already on disk —
          // both entries point at the same .pth so we dedupe.
          const file = String(c).replace(/^local:/, "");
          if (!file.toLowerCase().endsWith(".pth")) continue;
          if (seen.has(file)) continue;
          seen.add(file);
          const category = categoryFor(file);
          // Hide artist voices entirely unless the local-test flag is set.
          if (category === "artist" && !artistVoicesEnabled) continue;
          voices.push({ id: file, file, label: labelFor(file), category });
        }
      }
    } catch {}
  }

  // Trained LoRAs (Task #19) — query ComfyUI's LoraLoaderModelOnly dropdown
  // to enumerate every .safetensors in models/loras/. The CreatePanel LoRA
  // picker hydrates from this. Failure is non-fatal — we just return an
  // empty array and the picker shows "No trained LoRAs yet".
  let loras = [];
  try {
    const r = await fetch(`${COMFY_URL}/object_info/LoraLoaderModelOnly`, { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      const choices = data?.LoraLoaderModelOnly?.input?.required?.lora_name?.[0] || [];
      const seen = new Set();
      for (const c of choices) {
        const file = String(c).replace(/^local:/, "");
        if (!file.toLowerCase().endsWith(".safetensors")) continue;
        if (seen.has(file)) continue;
        seen.add(file);
        // Friendlier label: strip our "lora_u{u}_j{j}_" prefix that
        // exportLora adds, leaving just the user-chosen training name.
        const pretty = file.replace(/^lora_u\d+_j\d+_/, "").replace(/\.safetensors$/i, "");
        loras.push({ id: file, file, label: pretty || file });
      }
    }
  } catch {}

  return json({ lmModels, unetModels, coverModels, voices, loras });
});
