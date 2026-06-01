// Delete generated audio files from ComfyUI's output directory on disk.
// The backend runs on the same machine as ComfyUI, so it deletes directly
// (ComfyUI has no delete-via-API endpoint).
import fs from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.resolve(
  process.env.COMFY_OUTPUT_DIR || "/home/raveuk/comfy/ComfyUI/output"
);

// Remove output/<subfolder>/<filename>. No-op if missing. Refuses any path
// that resolves outside OUTPUT_DIR (defence against crafted filename/subfolder).
export function deleteOutputFile(subfolder, filename) {
  if (!filename) return;
  const target = path.resolve(OUTPUT_DIR, subfolder || "", filename);
  if (target !== OUTPUT_DIR && !target.startsWith(OUTPUT_DIR + path.sep)) return;
  try {
    fs.unlinkSync(target);
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Failed to delete audio file", target, e.message);
  }
}

// Read an output file off disk. Same path-traversal guard as the delete path.
// Returns a Buffer, or null when the file is missing.
export function readOutputFile(subfolder, filename) {
  if (!filename) return null;
  const target = path.resolve(OUTPUT_DIR, subfolder || "", filename);
  if (target !== OUTPUT_DIR && !target.startsWith(OUTPUT_DIR + path.sep)) return null;
  try { return fs.readFileSync(target); } catch (e) {
    if (e.code !== "ENOENT") console.error("Failed to read output file", target, e.message);
    return null;
  }
}

// Turn a user title into a filesystem-safe slug for the SaveAudioMP3 prefix.
export function titleSlug(title) {
  return (title || "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40);
}
