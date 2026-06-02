// POST /api/uploads — multipart audio upload, stages the file in ComfyUI's
// input/ folder and returns an uploadId. The Transform-panel features
// (Transcribe / Cover / Repaint / Extend / Edit) consume uploadIds; they
// never touch the raw file path themselves.
//
// GET /api/uploads — list the caller's recent staged uploads. Useful for the
// SourceAudioPicker so a user can re-use a recently uploaded file without
// re-uploading.
import { json, handler, requireUser } from "../../../lib/api.js";
import { db } from "../../../lib/db.js";
import { stageBuffer, sweepOldUploads, MAX_BYTES } from "../../../lib/uploads.js";

// Loosely rate-limited: 50 uploads/day/user. Cheap to count via SQLite.
const DAILY_LIMIT = 50;

export const POST = handler(async (req) => {
  const user = await requireUser(req);

  // Opportunistic GC — keeps input/ from filling up. One call per upload is
  // cheap and the cutoff query is indexed by created_at.
  sweepOldUploads(24);

  const today = db.prepare(
    "SELECT COUNT(*) AS n FROM uploads WHERE user_id = ? AND created_at > datetime('now', '-1 day')"
  ).get(user.id);
  if (today.n >= DAILY_LIMIT) {
    return json({ error: "daily upload limit reached" }, 429);
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "missing file" }, 400);

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return json({ error: "empty file" }, 400);
  if (buf.length > MAX_BYTES) return json({ error: `file too large (max ${MAX_BYTES / 1024 / 1024}MB)` }, 413);

  try {
    const { uploadId, filename } = stageBuffer({
      buf,
      userId: user.id,
      originalName: file.name || null,
      mime: file.type || null,
    });
    return json({ uploadId, filename, originalName: file.name || null, sizeBytes: buf.length });
  } catch (e) {
    return json({ error: e.message || "upload failed" }, e.status || 500);
  }
});

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const rows = db.prepare(
    `SELECT id, filename, original_name AS originalName, size_bytes AS sizeBytes,
            source, track_id AS trackId, created_at AS createdAt
     FROM uploads WHERE user_id = ?
     ORDER BY id DESC LIMIT 50`
  ).all(user.id);
  return json({ uploads: rows });
});
