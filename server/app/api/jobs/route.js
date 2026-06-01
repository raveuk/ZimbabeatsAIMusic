import { db } from "../../../lib/db.js";
import { requireUser, json, handler } from "../../../lib/api.js";
import { refreshTrack, publicTrack } from "../../../lib/tracks.js";

// List the current user's tracks, refreshing any still in flight.
export const GET = handler(async (req) => {
  const user = requireUser(req);
  const rows = db
    .prepare("SELECT * FROM tracks WHERE user_id = ? ORDER BY id DESC")
    .all(user.id);
  const refreshed = await Promise.all(rows.map((r) => refreshTrack(r)));
  return json({ tracks: refreshed.map(publicTrack) });
});
