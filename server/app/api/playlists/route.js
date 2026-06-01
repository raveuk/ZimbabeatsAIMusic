import { db } from "../../../lib/db.js";
import { requireUser, json, handler } from "../../../lib/api.js";

// List the user's playlists with a track count.
export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const rows = db
    .prepare(`
      SELECT p.id, p.name, p.created_at,
             (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
      FROM playlists p WHERE p.user_id = ? ORDER BY p.id DESC
    `)
    .all(user.id);
  return json({ playlists: rows.map((r) => ({ id: r.id, name: r.name, trackCount: r.track_count, createdAt: r.created_at })) });
});

// Create a playlist.
export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const { name } = await req.json();
  const trimmed = (name || "").trim();
  if (!trimmed) return json({ error: "name required" }, 400);
  const info = db.prepare("INSERT INTO playlists (user_id, name) VALUES (?, ?)").run(user.id, trimmed);
  return json({ playlist: { id: Number(info.lastInsertRowid), name: trimmed, trackCount: 0 } });
});
