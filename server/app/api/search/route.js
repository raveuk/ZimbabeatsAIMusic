import { db } from "../../../lib/db.js";
import { json, handler } from "../../../lib/api.js";
import { refreshTrack, publicTrack } from "../../../lib/tracks.js";

// Cross-user search across all *public* finished tracks. We match title +
// the JSON params blob with LIKE because there's no fulltext index yet;
// fine for the small dataset, swap to FTS5 later if results-per-query
// climb past a few seconds.
export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const q   = (url.searchParams.get("q") || "").trim();
  const type = url.searchParams.get("type") || "all";
  if (!q) return json({ songs: [], creators: [], playlists: [] });

  const like = `%${q}%`;
  const out = { songs: [], creators: [], playlists: [] };

  // ----- songs -----
  if (type === "all" || type === "songs") {
    const rows = db.prepare(`
      SELECT t.*, u.email AS owner_email
      FROM tracks t JOIN users u ON u.id = t.user_id
      WHERE t.is_public = 1 AND t.status = 'done'
        AND (t.title LIKE ? OR t.params_json LIKE ?)
      ORDER BY t.id DESC LIMIT 30
    `).all(like, like);
    const tracks = await Promise.all(rows.map((r) => refreshTrack(r)));
    out.songs = tracks.map((r) => ({
      ...publicTrack(r),
      creator: (r.owner_email || "").split("@")[0],
    }));
  }

  // ----- creators -----
  if (type === "all" || type === "creators") {
    const rows = db.prepare(`
      SELECT u.id, u.email, u.created_at,
             (SELECT COUNT(*) FROM tracks t WHERE t.user_id = u.id AND t.is_public = 1 AND t.status = 'done') AS song_count
      FROM users u
      WHERE substr(u.email, 1, instr(u.email, '@') - 1) LIKE ?
      LIMIT 12
    `).all(like);
    out.creators = rows.map((r) => ({
      id: String(r.id),
      username: r.email.split("@")[0],
      isAdmin: false,
      bio: "",
      avatar_url: "",
      banner_url: "",
      created_at: r.created_at,
      songCount: r.song_count,
      follower_count: 0,
    }));
  }

  return json(out);
});
