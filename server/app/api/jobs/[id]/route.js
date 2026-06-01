import { db } from "../../../../lib/db.js";
import { requireUser, json, handler } from "../../../../lib/api.js";
import { refreshTrack, publicTrack } from "../../../../lib/tracks.js";
import { deleteOutputFile } from "../../../../lib/files.js";

export const GET = handler(async (req, ctx) => {
  const user = requireUser(req);
  const { id } = await ctx.params;
  const row = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(Number(id), user.id);
  if (!row) return json({ error: "not found" }, 404);
  return json({ track: publicTrack(await refreshTrack(row)) });
});

// Delete a track: removes the DB row (cascading out of all playlists) and
// deletes the generated mp3 from ComfyUI's output directory on disk.
export const DELETE = handler(async (req, ctx) => {
  const user = requireUser(req);
  const { id } = await ctx.params;
  const row = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(Number(id), user.id);
  if (!row) return json({ error: "not found" }, 404);
  deleteOutputFile(row.subfolder, row.filename);
  if (row.cover_filename) deleteOutputFile(row.cover_subfolder, row.cover_filename);
  db.prepare("DELETE FROM tracks WHERE id = ?").run(row.id);
  return json({ ok: true });
});
