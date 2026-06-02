import { db } from "../../../../../lib/db.js";
import { json, handler } from "../../../../../lib/api.js";

// Featured creators = users with the most public tracks. No auth.
// Until we add follow graph + follower counts, this is the simplest sort.
export const GET = handler(async () => {
  const rows = db.prepare(`
    SELECT u.id, u.email, u.created_at, COUNT(t.id) AS public_count
    FROM users u
    LEFT JOIN tracks t ON t.user_id = u.id AND t.is_public = 1 AND t.status = 'done'
    GROUP BY u.id
    HAVING public_count > 0
    ORDER BY public_count DESC
    LIMIT 12
  `).all();

  return json({
    creators: rows.map((r) => ({
      id: String(r.id),
      username: r.email.split("@")[0],
      isAdmin: false,
      bio: "",
      avatar_url: "",
      banner_url: "",
      created_at: r.created_at,
      songCount: r.public_count,
      follower_count: 0,
    })),
  });
});
