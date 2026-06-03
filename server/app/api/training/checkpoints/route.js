// GET /api/training/checkpoints — lists the base ACE-Step diffusion
// checkpoints and the LoRA config JSONs the trainer.py script accepts.
//
// Checkpoints are scanned from ComfyUI's models/diffusion_models/ (where the
// existing text2music workflow already loads acestep_v1.5_xl_sft_bf16.safetensors).
// Configs come from the upstream repo's config/ folder.
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../lib/api.js";
import { ACE_STEP_DIR } from "../../../../lib/training.js";

const COMFY_MODELS = path.join(process.env.COMFYUI_ROOT || "/home/raveuk/comfy/ComfyUI", "models");

export const GET = handler(async (req) => {
  await requireUser(req);

  // Base diffusion checkpoints — the trainer needs the ACE-Step UNET file.
  const diffDir = path.join(COMFY_MODELS, "diffusion_models");
  let checkpoints = [];
  try {
    checkpoints = fs.readdirSync(diffDir)
      .filter((f) => /^acestep.*\.safetensors$/i.test(f))
      .map((f) => path.join(diffDir, f));
  } catch {}

  // LoRA configs ship with the ACE-Step repo under config/. We also support
  // user-provided configs dropped into the same dir.
  const configsDir = path.join(ACE_STEP_DIR, "config");
  let configs = [];
  try {
    configs = fs.readdirSync(configsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(configsDir, f));
  } catch {}

  return json({ checkpoints, configs });
});
