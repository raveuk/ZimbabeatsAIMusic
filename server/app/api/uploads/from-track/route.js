// POST /api/uploads/from-track — convert a finished track in the caller's
// library into a staged upload, so it can be used as the source audio for
// Transform tasks (Cover, Repaint, Extend, Edit) without a round-trip
// re-upload. Body: { trackId }. Returns { uploadId, filename }.
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../lib/api.js";
import { db } from "../../../../lib/db.js";
import { stageBuffer } from "../../../../lib/uploads.js";

const COMFYUI_ROOT = process.env.COMFYUI_ROOT || "/home/raveuk/comfy/ComfyUI";
const OUTPUT_DIR = path.join(COMFYUI_ROOT, "output", "music_app");

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const trackId = Number(body?.trackId);
  if (!Number.isInteger(trackId) || trackId <= 0) return json({ error: "trackId required" }, 400);

  const row = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(trackId, user.id);
  if (!row) return json({ error: "track not found" }, 404);
  if (row.status !== "done" || !row.filename) return json({ error: "track not finished" }, 400);

  const srcPath = path.join(OUTPUT_DIR, row.filename);
  if (!fs.existsSync(srcPath)) return json({ error: "audio file missing on disk" }, 410);

  const buf = fs.readFileSync(srcPath);
  try {
    const { uploadId, filename } = stageBuffer({
      buf,
      userId: user.id,
      originalName: row.title || row.filename,
      mime: "audio/mpeg",
      source: "track",
      trackId,
    });
    return json({ uploadId, filename, trackId, title: row.title });
  } catch (e) {
    return json({ error: e.message || "stage failed" }, e.status || 500);
  }
});
