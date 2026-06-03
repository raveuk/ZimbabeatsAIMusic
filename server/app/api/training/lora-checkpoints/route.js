// GET /api/training/lora-checkpoints — lists existing .safetensors LoRAs the
// user could resume from. Returns the per-user-prefixed files under
// ComfyUI/models/loras/ (where exportLora puts new LoRAs).
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../lib/api.js";
import { COMFY_LORAS_DIR } from "../../../../lib/training.js";

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  let checkpoints = [];
  try {
    const userPrefix = `lora_u${user.id}_`;
    checkpoints = fs.readdirSync(COMFY_LORAS_DIR)
      .filter((f) => f.startsWith(userPrefix) && f.endsWith(".safetensors"))
      .map((f) => path.join(COMFY_LORAS_DIR, f));
  } catch {}
  return json({ checkpoints, outputDir: COMFY_LORAS_DIR });
});
