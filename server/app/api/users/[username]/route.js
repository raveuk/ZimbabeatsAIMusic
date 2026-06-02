import { db } from "../../../../lib/db.js";
import { json, handler } from "../../../../lib/api.js";

// Public profile lookup. Username = the local-part of the email (everything
// before the '@'). We don't store usernames separately yet, so the same
// derivation the UI uses (email -> username) is replayed server-side.
export const GET = handler(async (_req, ctx) => {
  const { username } = await ctx.params;
  if (!username) return json({ error: "username required" }, 400);
  const target = String(username).toLowerCase();

  const row = db.prepare(`
    SELECT id, email, role, created_at
    FROM users WHERE lower(substr(email, 1, instr(email, '@') - 1)) = ?
  `).get(target);
  if (!row) return json({ error: "not found" }, 404);

  // Count their public tracks so the profile card can show "12 songs".
  const { n: songCount } = db
    .prepare("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND is_public = 1 AND status = 'done'")
    .get(row.id);

  return json({
    user: {
      id: String(row.id),
      username: row.email.split("@")[0],
      isAdmin: row.role === "admin",
      bio: "",
      avatar_url: "",
      banner_url: "",
      created_at: row.created_at,
      songCount,
    },
  });
});
