import { db } from "../../../../lib/db.js";
import { json, handler } from "../../../../lib/api.js";
import { refreshTrack, publicTrack } from "../../../../lib/tracks.js";

// Paginated list of every user's public + finished tracks. No auth needed —
// this is the discovery endpoint. ?limit=20&offset=0
export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const limit  = Math.min(60, Math.max(1, parseInt(url.searchParams.get("limit")  || "20", 10) || 20));
  const offset = Math.max(0,           parseInt(url.searchParams.get("offset") || "0",  10) || 0);

  const rows = db.prepare(`
    SELECT t.*, u.email AS owner_email
    FROM tracks t JOIN users u ON u.id = t.user_id
    WHERE t.is_public = 1 AND t.status = 'done'
    ORDER BY t.id DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  const tracks = await Promise.all(rows.map((r) => refreshTrack(r)));
  return json({
    tracks: tracks.map((r) => ({
      ...publicTrack(r),
      creator: (r.owner_email || "").split("@")[0],
    })),
  });
});
