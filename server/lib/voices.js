// Lists the trained RVC voice models available for cloning. Point VOICES_DIR at
// the folder the ComfyUI RVC node loads models from, so the app's dropdown and
// the node's combo stay in sync. The value sent to the backend (and on to the
// RVC node) is the .pth filename.
import fs from "node:fs";
import path from "node:path";

const VOICES_DIR = process.env.VOICES_DIR || "";

export function listVoices() {
  if (!VOICES_DIR) return [];
  try {
    return fs
      .readdirSync(VOICES_DIR)
      .filter((f) => f.toLowerCase().endsWith(".pth"))
      .map((f) => ({ file: f, name: path.basename(f, path.extname(f)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
