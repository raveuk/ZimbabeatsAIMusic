import { db } from "../../../../lib/db.js";
import { requireUser, json, handler } from "../../../../lib/api.js";
import { refreshTrack, publicTrack } from "../../../../lib/tracks.js";

function ownedPlaylist(userId, id) {
  return db.prepare("SELECT * FROM playlists WHERE id = ? AND user_id = ?").get(Number(id), userId);
}

// Playlist detail with its tracks (in the order they were added).
export const GET = handler(async (req, ctx) => {
  const user = requireUser(req);
  const { id } = await ctx.params;
  const pl = ownedPlaylist(user.id, id);
  if (!pl) return json({ error: "not found" }, 404);

  const rows = db
    .prepare(`
      SELECT t.* FROM playlist_tracks pt
      JOIN tracks t ON t.id = pt.track_id
      WHERE pt.playlist_id = ?
      ORDER BY pt.added_at ASC, pt.track_id ASC
    `)
    .all(pl.id);
  const tracks = await Promise.all(rows.map((r) => refreshTrack(r)));
  return json({ playlist: { id: pl.id, name: pl.name, createdAt: pl.created_at }, tracks: tracks.map(publicTrack) });
});

// Delete a playlist (its track memberships cascade; the tracks themselves stay).
export const DELETE = handler(async (req, ctx) => {
  const user = requireUser(req);
  const { id } = await ctx.params;
  const info = db.prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?").run(Number(id), user.id);
  if (info.changes === 0) return json({ error: "not found" }, 404);
  return json({ ok: true });
});
