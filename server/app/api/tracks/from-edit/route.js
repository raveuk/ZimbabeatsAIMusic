// POST /api/tracks/from-edit
//
// Save-as flow: create a new tracks row whose audio is the MP3 the user just
// edited in AudioMass. Body is multipart: `file` (MP3) + `sourceTrackId`.
// Metadata (title, params_json) is cloned from the source so the new track
// shows up in the library with the same vibe + an "(edit)" suffix in title.
import crypto from "node:crypto";
import { json, handler, requireUser } from "../../../../lib/api.js";
import { db } from "../../../../lib/db.js";
import { writeOutputFile, titleSlug } from "../../../../lib/files.js";

const MAX_BYTES = 50 * 1024 * 1024;

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const form = await req.formData();
  const f = form.get("file");
  if (!f || typeof f === "string") return json({ error: "file required" }, 400);
  const sourceTrackId = Number(form.get("sourceTrackId"));
  if (!Number.isInteger(sourceTrackId) || sourceTrackId <= 0)
    return json({ error: "sourceTrackId required" }, 400);

  const src = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?")
    .get(sourceTrackId, user.id);
  if (!src) return json({ error: "source track not found" }, 404);

  // Track-quota guard mirrors the generate route — Save As counts as a new
  // track. NULL = unlimited.
  if (user.track_quota != null) {
    const count = db.prepare("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ?")
      .get(user.id).n;
    if (count >= user.track_quota)
      return json({ error: `track quota reached (${count}/${user.track_quota})` }, 403);
  }

  const ab = await f.arrayBuffer();
  if (ab.byteLength > MAX_BYTES) return json({ error: "file too large" }, 413);
  if (ab.byteLength < 256) return json({ error: "file too small" }, 400);
  const buf = Buffer.from(ab);

  // Clone metadata, mark the title as an edit.
  const newTitle = ((src.title || `Track #${sourceTrackId}`) + " (edit)").slice(0, 200);

  const ins = db.prepare(
    `INSERT INTO tracks (user_id, title, params_json, status, subfolder)
     VALUES (?, ?, ?, 'done', ?)`
  ).run(user.id, newTitle, src.params_json || "{}", "music_app");
  const trackId = Number(ins.lastInsertRowid);

  const slug = titleSlug(newTitle);
  const nonce = crypto.randomBytes(4).toString("hex");
  const filename = `u${user.id}_t${trackId}_editof${sourceTrackId}_${nonce}${slug ? `_${slug}` : ""}.mp3`;

  const abs = writeOutputFile("music_app", filename, buf);
  if (!abs) {
    db.prepare("DELETE FROM tracks WHERE id = ?").run(trackId);
    return json({ error: "could not write file" }, 500);
  }
  db.prepare("UPDATE tracks SET filename = ? WHERE id = ?").run(filename, trackId);

  return json({
    trackId,
    sourceTrackId,
    filename,
    audioUrl: `/api/audio/${trackId}`,
    title: newTitle,
  });
});
