import { db } from "../../../../../lib/db.js";
import { requireUser, json, handler } from "../../../../../lib/api.js";

// Add one of the user's tracks to one of the user's playlists.
export const POST = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const { trackId } = await req.json();

  const pl = db.prepare("SELECT id FROM playlists WHERE id = ? AND user_id = ?").get(Number(id), user.id);
  if (!pl) return json({ error: "playlist not found" }, 404);
  const track = db.prepare("SELECT id FROM tracks WHERE id = ? AND user_id = ?").get(Number(trackId), user.id);
  if (!track) return json({ error: "track not found" }, 404);

  db.prepare("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)").run(pl.id, track.id);
  return json({ ok: true });
});
