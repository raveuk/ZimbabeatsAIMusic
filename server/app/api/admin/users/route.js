import { db } from "../../../../lib/db.js";
import { requireAdmin, json, handler } from "../../../../lib/api.js";

// Admin: list every user with how many tracks they have.
export const GET = handler(async (req) => {
  requireAdmin(req);
  const rows = db.prepare(`
    SELECT u.id, u.email, u.role, u.created_at, u.disabled, u.track_quota,
           (SELECT COUNT(*) FROM tracks t WHERE t.user_id = u.id) AS track_count
    FROM users u
    ORDER BY u.id ASC
  `).all();
  // SQLite returns disabled as 0/1; normalise to a real boolean for the client.
  for (const r of rows) r.disabled = !!r.disabled;
  return json({ users: rows });
});
