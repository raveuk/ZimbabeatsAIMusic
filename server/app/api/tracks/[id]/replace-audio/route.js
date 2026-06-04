// POST /api/tracks/[id]/replace-audio
//
// Overwrite the source track's audio with an MP3 produced by AudioMass.
// Multipart upload (field "file"), 50 MB cap. Owner-only; track must be
// status='done'. The new file lives at the same `output/music_app/` location
// the trainer writes to, so the existing /api/audio/[id] stream picks it up
// with no other changes. The old file (if present) is deleted first to keep
// disk tidy. Returns the new audio URL the player should reload.
import crypto from "node:crypto";
import { json, handler, requireUser } from "../../../../../lib/api.js";
import { db } from "../../../../../lib/db.js";
import { deleteOutputFile, writeOutputFile, titleSlug } from "../../../../../lib/files.js";

const MAX_BYTES = 50 * 1024 * 1024;

export const POST = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const trackId = Number(id);
  if (!Number.isInteger(trackId) || trackId <= 0) return json({ error: "bad id" }, 400);

  const row = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(trackId, user.id);
  if (!row) return json({ error: "track not found" }, 404);
  if (row.status !== "done") return json({ error: "track not finished" }, 400);

  const form = await req.formData();
  const f = form.get("file");
  if (!f || typeof f === "string") return json({ error: "file required" }, 400);
  const ab = await f.arrayBuffer();
  if (ab.byteLength > MAX_BYTES) return json({ error: "file too large" }, 413);
  if (ab.byteLength < 256) return json({ error: "file too small" }, 400);
  const buf = Buffer.from(ab);

  // Keep MP3 extension (AudioMass always exports MP3 from the bridge). Drop
  // the original file when we rename to avoid leaking disk over many edits.
  const slug = titleSlug(row.title);
  const nonce = crypto.randomBytes(4).toString("hex");
  const filename = `u${user.id}_t${trackId}_edit_${nonce}${slug ? `_${slug}` : ""}.mp3`;
  const subfolder = row.subfolder || "music_app";

  const abs = writeOutputFile(subfolder, filename, buf);
  if (!abs) return json({ error: "could not write file" }, 500);

  if (row.filename && row.filename !== filename) {
    deleteOutputFile(row.subfolder || "music_app", row.filename);
  }

  db.prepare("UPDATE tracks SET filename = ?, subfolder = ? WHERE id = ?")
    .run(filename, subfolder, trackId);

  return json({ trackId, filename, audioUrl: `/api/audio/${trackId}` });
});
