import { db } from "../../../../../lib/db.js";
import { json, handler } from "../../../../../lib/api.js";
import { refreshTrack, publicTrack } from "../../../../../lib/tracks.js";

// All of one user's *public* finished tracks, newest first. No auth — this is
// part of the public-profile surface.
export const GET = handler(async (_req, ctx) => {
  const { username } = await ctx.params;
  const target = String(username || "").toLowerCase();
  if (!target) return json({ tracks: [] });

  const user = db.prepare(`
    SELECT id, email FROM users
    WHERE lower(substr(email, 1, instr(email, '@') - 1)) = ?
  `).get(target);
  if (!user) return json({ tracks: [] });

  const rows = db.prepare(`
    SELECT * FROM tracks
    WHERE user_id = ? AND is_public = 1 AND status = 'done'
    ORDER BY id DESC LIMIT 60
  `).all(user.id);

  const tracks = await Promise.all(rows.map((r) => refreshTrack(r)));
  const creator = user.email.split("@")[0];
  return json({ tracks: tracks.map((r) => ({ ...publicTrack(r), creator })) });
});
