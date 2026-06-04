// Music video refresh helper — mirrors refreshTrack but pulls the final MP4
// out of ComfyUI's /history and stamps the row when it lands. Called from
// the per-id GET route; idempotent so polling is cheap.
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { getHistory } from "./comfy.js";
import { progressFor } from "./progress.js";

const COMFYUI_ROOT = process.env.COMFYUI_ROOT || "/home/raveuk/comfy/ComfyUI";
const OUTPUT_DIR   = path.join(COMFYUI_ROOT, "output");

export async function refreshMusicVideo(row) {
  if (!row || row.status === "done" || row.status === "error") return row;
  if (!row.prompt_id) return row;

  const entry = await getHistory(row.prompt_id);
  if (!entry) return row;
  const s = entry.status?.status_str;
  if (s === "error") {
    const msg = (entry.status?.messages || [])
      .filter((m) => m[0] === "execution_error")
      .map((m) => m[1]?.exception_message || "")
      .join(" | ").slice(0, 800);
    db.prepare("UPDATE music_videos SET status='error', error_message=? WHERE id=?")
      .run(msg || "render failed", row.id);
    return { ...row, status: "error", error_message: msg };
  }
  if (s !== "success") return row;

  // Find the SaveVideo output. ComfyUI's history `outputs` keys by node id;
  // SaveVideo emits a `videos: [{filename, subfolder, type}]` list. Some
  // builds use `gifs` for legacy compat — handle both.
  let saved = null;
  for (const nid of Object.keys(entry.outputs || {})) {
    const o = entry.outputs[nid];
    const list = o?.videos || o?.gifs || [];
    for (const v of list) {
      if (v?.filename) { saved = v; break; }
    }
    if (saved) break;
  }

  // Fallback: scan music_app/ for the prefix we asked SaveVideo to use.
  if (!saved) {
    const params = (() => { try { return JSON.parse(row.params_json || "{}"); } catch { return {}; } })();
    const prefix = `musicvideo_u${row.user_id}_v${row.id}`;
    const dir = path.join(OUTPUT_DIR, "music_app");
    try {
      const f = fs.readdirSync(dir).find((n) => n.startsWith(prefix) && /\.(mp4|webm|mov|gif)$/i.test(n));
      if (f) saved = { filename: f, subfolder: "music_app", type: "output" };
    } catch {}
  }

  if (saved) {
    db.prepare("UPDATE music_videos SET status='done', filename=?, subfolder=? WHERE id=?")
      .run(saved.filename, saved.subfolder || "", row.id);
    return { ...row, status: "done", filename: saved.filename, subfolder: saved.subfolder || "" };
  }
  // Prompt completed but we couldn't locate the file — degrade gracefully.
  db.prepare("UPDATE music_videos SET status='error', error_message=? WHERE id=?")
    .run("render reported success but no output file found", row.id);
  return { ...row, status: "error" };
}

export function publicMusicVideo(row) {
  if (!row) return null;
  return {
    id: row.id,
    trackId: row.track_id,
    imageUploadId: row.image_upload_id,
    stylePrompt: row.style_prompt,
    status: row.status,
    filename: row.filename,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    videoUrl: row.filename ? `/api/musicvideo/${row.id}/file` : null,
    progress: row.status === "running" && row.prompt_id ? progressFor(row.prompt_id) : null,
  };
}
