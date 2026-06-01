import { db } from "../../../../lib/db.js";
import { hashPassword, signToken, ensureAdminRole } from "../../../../lib/auth.js";
import { json, handler } from "../../../../lib/api.js";

export const POST = handler(async (req) => {
  const { email, password } = await req.json();
  if (!email || !password || password.length < 6) {
    return json({ error: "email and password (min 6 chars) required" }, 400);
  }
  const lc = email.toLowerCase();
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(lc);
  if (exists) return json({ error: "email already registered" }, 409);

  const info = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run(lc, hashPassword(password));
  const uid = Number(info.lastInsertRowid);
  let user = db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(uid);
  user = ensureAdminRole(user);
  return json({ token: signToken({ uid: user.id }), user });
});
