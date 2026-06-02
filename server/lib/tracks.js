// Refresh a track's status against ComfyUI and persist any terminal result.
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { getHistory, getQueueState, summarizeHistory } from "./comfy.js";
import { progressFor } from "./progress.js";

// ComfyUI's history is in-memory and capped — old prompts get evicted. When
// that happens our refresh path gets nothing back and the DB row stays as
// 'running' forever. As a fallback, scan the output dir for a file matching
// the predictable naming pattern: music_app/u{user_id}_t{track_id}*.mp3
const OUTPUT_DIR = path.join(process.env.COMFYUI_ROOT || "/home/raveuk/comfy/ComfyUI", "output", "music_app");
function findAudioOnDisk(userId, trackId) {
  try {
    const prefix = `u${userId}_t${trackId}_`;
    const matches = fs.readdirSync(OUTPUT_DIR).filter((f) => f.startsWith(prefix) && f.endsWith(".mp3") && !f.includes("_cover"));
    return matches[0] || null;
  } catch { return null; }
}
function findCoverOnDisk(userId, trackId) {
  try {
    const prefix = `u${userId}_t${trackId}_`;
    const matches = fs.readdirSync(OUTPUT_DIR).filter((f) => f.startsWith(prefix) && f.endsWith(".png") && f.includes("_cover"));
    return matches[0] || null;
  } catch { return null; }
}

// Audio + cover refresh from ComfyUI history. Cover lives in a separate prompt
// and may finish before, after, or alongside the audio — we update each
// independently so the cover can appear in the UI as soon as it's ready.
export async function refreshTrack(track) {
  let t = track;
  if (t.status !== "done" && t.status !== "error" && t.prompt_id) {
    const entry = await getHistory(t.prompt_id);
    const { status, output, error } = summarizeHistory(entry);
    if (status === "done" && output) {
      db.prepare("UPDATE tracks SET status = 'done', filename = ?, subfolder = ? WHERE id = ?")
        .run(output.filename, output.subfolder || "", t.id);
      t = { ...t, status: "done", filename: output.filename, subfolder: output.subfolder || "" };
    } else if (status === "error") {
      db.prepare("UPDATE tracks SET status = 'error' WHERE id = ?").run(t.id);
      t = { ...t, status: "error", error };
    } else {
      const queue = await getQueueState(t.prompt_id);
      // Fallback: ComfyUI's history forgot this prompt AND it's not in the
      // queue. Look for the output file on disk — if present, it actually
      // finished (history just rolled over). Otherwise leave as
      // running/queued for now.
      if (!queue.running && queue.position == null) {
        const found = findAudioOnDisk(t.user_id, t.id);
        if (found) {
          db.prepare("UPDATE tracks SET status = 'done', filename = ?, subfolder = ? WHERE id = ?")
            .run(found, "music_app", t.id);
          t = { ...t, status: "done", filename: found, subfolder: "music_app" };
        } else {
          t = { ...t, status: "queued", queuePosition: null };
        }
      } else {
        t = { ...t, status: queue.running ? "running" : "queued", queuePosition: queue.position };
      }
    }
  }
  // Cover can land independently — check it whenever it's still unknown.
  if (t.cover_prompt_id && !t.cover_filename) {
    const entry = await getHistory(t.cover_prompt_id);
    const saved = entry?.outputs && Object.values(entry.outputs).find((o) => o.images?.length);
    if (saved) {
      const img = saved.images[0];
      db.prepare("UPDATE tracks SET cover_filename = ?, cover_subfolder = ? WHERE id = ?")
        .run(img.filename, img.subfolder || "", t.id);
      t = { ...t, cover_filename: img.filename, cover_subfolder: img.subfolder || "" };
    } else {
      // Same disk-fallback for the cover when ComfyUI's history rolled over.
      const found = findCoverOnDisk(t.user_id, t.id);
      if (found) {
        db.prepare("UPDATE tracks SET cover_filename = ?, cover_subfolder = ? WHERE id = ?")
          .run(found, "music_app", t.id);
        t = { ...t, cover_filename: found, cover_subfolder: "music_app" };
      }
    }
  }
  return t;
}

export function publicTrack(t) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    params: JSON.parse(t.params_json),
    createdAt: t.created_at,
    queuePosition: t.queuePosition ?? null,
    progress: t.status === "running" && t.prompt_id ? progressFor(t.prompt_id) : null,
    audioUrl: t.status === "done" ? `/api/audio/${t.id}` : null,
    // Cache-bust the cover by appending the prompt id. ComfyUI's SaveImage
    // reuses the same filename when we delete the previous file before regen,
    // so without ?v=… RN <Image> would keep showing the cached old PNG.
    coverUrl: t.cover_filename ? `/api/cover/${t.id}?v=${t.cover_prompt_id || ""}` : null,
    // True when a cover prompt was submitted but the file isn't on the DB yet.
    // The app uses this to keep polling /api/jobs until the cover lands.
    coverPending: !!(t.cover_prompt_id && !t.cover_filename),
    isPublic: !!t.is_public,
  };
}
