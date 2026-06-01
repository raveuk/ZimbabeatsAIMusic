// Password hashing (scrypt) + JWT (HS256), both from node:crypto — no deps.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";

// Persist a JWT secret so tokens survive restarts. Override with JWT_SECRET env.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const p = path.join(process.cwd(), "data", "jwt.secret");
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    const s = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(p, s, { mode: 0o600 });
    return s;
  }
}
const SECRET = loadSecret();

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const got = crypto.scryptSync(password, salt, 64);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function signToken(payload, days = 30) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const body = b64url(JSON.stringify({ ...payload, exp }));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const [header, body, sig] = token.split(".");
  if (!header || !body || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- Password reset tokens -------------------------------------------------
// We store only a sha256 hash of the token, so a DB leak can't be used to reset.
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Create a single-use reset token for a user; returns the raw token to email.
export function createResetToken(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = Date.now() + RESET_TTL_MS;
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(userId); // one live token per user
  db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(sha256(token), userId, expires);
  return token;
}

// Validate + consume a reset token, setting the new password. Returns true on success.
export function consumeResetToken(token, newPassword) {
  if (!token) return false;
  const row = db
    .prepare("SELECT token_hash, user_id, expires_at, used FROM password_resets WHERE token_hash = ?")
    .get(sha256(token));
  if (!row || row.used || row.expires_at < Date.now()) return false;
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), row.user_id);
  db.prepare("UPDATE password_resets SET used = 1 WHERE token_hash = ?").run(row.token_hash);
  return true;
}

// Pull the user from an Authorization: Bearer <token> header, OR from a
// ?token=<jwt> query param. The query-param path exists for native <Image>
// loaders that can't reliably attach auth headers — used by /api/cover.
export function userFromRequest(req) {
  const auth = req.headers.get("authorization") || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    try { token = new URL(req.url).searchParams.get("token"); } catch {}
  }
  const payload = verifyToken(token);
  if (!payload?.uid) return null;
  return db
    .prepare("SELECT id, email, role, disabled, track_quota FROM users WHERE id = ?")
    .get(payload.uid) ?? null;
}

// If the configured ADMIN_EMAIL matches a user, make sure they're marked admin.
// Called on every successful register/login so promotion is automatic and
// idempotent — set ADMIN_EMAIL=you@…, log in once, you're admin.
export function ensureAdminRole(userRow) {
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  if (!adminEmail || !userRow || userRow.email !== adminEmail) return userRow;
  if (userRow.role !== "admin") {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userRow.id);
    return { ...userRow, role: "admin" };
  }
  return userRow;
}
