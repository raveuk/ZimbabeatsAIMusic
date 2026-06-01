import { db } from "../../../../../../lib/db.js";
import { requireUser, json, handler } from "../../../../../../lib/api.js";

// Remove a track from a playlist (does not delete the track itself).
export const DELETE = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id, trackId } = await ctx.params;
  const pl = db.prepare("SELECT id FROM playlists WHERE id = ? AND user_id = ?").get(Number(id), user.id);
  if (!pl) return json({ error: "playlist not found" }, 404);
  db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?").run(pl.id, Number(trackId));
  return json({ ok: true });
});
