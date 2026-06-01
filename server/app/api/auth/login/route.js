import { db } from "../../../../lib/db.js";
import { verifyPassword, signToken, ensureAdminRole } from "../../../../lib/auth.js";
import { json, handler } from "../../../../lib/api.js";

export const POST = handler(async (req) => {
  const { email, password } = await req.json();
  const row = db
    .prepare("SELECT id, email, password_hash, role, disabled FROM users WHERE email = ?")
    .get((email || "").toLowerCase());
  if (!row || !verifyPassword(password || "", row.password_hash)) {
    return json({ error: "invalid credentials" }, 401);
  }
  if (row.disabled) return json({ error: "this account has been disabled" }, 403);
  const user = ensureAdminRole({ id: row.id, email: row.email, role: row.role });
  return json({ token: signToken({ uid: user.id }), user });
});
