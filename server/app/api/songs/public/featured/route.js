import { db } from "../../../../../lib/db.js";
import { json, handler } from "../../../../../lib/api.js";
import { refreshTrack, publicTrack } from "../../../../../lib/tracks.js";

// Featured = the 12 most recently completed public tracks. Until we add play
// counts or a curation flag, "newest first" is the simplest meaningful sort.
// No auth — discovery surface for signed-out and signed-in visitors alike.
export const GET = handler(async () => {
  const rows = db.prepare(`
    SELECT t.*, u.email AS owner_email
    FROM tracks t JOIN users u ON u.id = t.user_id
    WHERE t.is_public = 1 AND t.status = 'done'
    ORDER BY t.id DESC LIMIT 12
  `).all();

  const tracks = await Promise.all(rows.map((r) => refreshTrack(r)));
  return json({
    tracks: tracks.map((r) => ({
      ...publicTrack(r),
      creator: (r.owner_email || "").split("@")[0],
    })),
  });
});
