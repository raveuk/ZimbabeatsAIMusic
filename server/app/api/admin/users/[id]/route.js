import { db } from "../../../../../lib/db.js";
import { hashPassword } from "../../../../../lib/auth.js";
import { requireAdmin, json, handler } from "../../../../../lib/api.js";
import { deleteOutputFile } from "../../../../../lib/files.js";

// Admin: change a user's role and/or set a new password.
//   body: { role?: 'admin'|'user', password?: string }
export const PATCH = handler(async (req, ctx) => {
  const admin = requireAdmin(req);
  const { id } = await ctx.params;
  const uid = Number(id);
  const target = db.prepare("SELECT id, email FROM users WHERE id = ?").get(uid);
  if (!target) return json({ error: "user not found" }, 404);

  const body = await req.json().catch(() => ({}));
  if (body.password) {
    if (body.password.length < 6) return json({ error: "password must be 6+ chars" }, 400);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(body.password), uid);
  }
  if (body.role === "admin" || body.role === "user") {
    if (body.role === "user" && uid === admin.id) return json({ error: "you can't demote yourself" }, 400);
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(body.role, uid);
  }
  if (typeof body.disabled === "boolean") {
    if (body.disabled && uid === admin.id) return json({ error: "you can't disable yourself" }, 400);
    db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(body.disabled ? 1 : 0, uid);
  }
  if ("trackQuota" in body) {
    // null / "" → unlimited; otherwise must be a non-negative integer.
    const q = body.trackQuota;
    if (q === null || q === "") {
      db.prepare("UPDATE users SET track_quota = NULL WHERE id = ?").run(uid);
    } else {
      const n = Number(q);
      if (!Number.isInteger(n) || n < 0) return json({ error: "trackQuota must be a non-negative integer or null" }, 400);
      db.prepare("UPDATE users SET track_quota = ? WHERE id = ?").run(n, uid);
    }
  }
  const updated = db.prepare("SELECT id, email, role, disabled, track_quota FROM users WHERE id = ?").get(uid);
  updated.disabled = !!updated.disabled;
  return json({ user: updated });
});

// Admin: delete a user and all their data (tracks + cover files on disk +
// playlists). The playlist_tracks table cascades automatically.
export const DELETE = handler(async (req, ctx) => {
  const admin = requireAdmin(req);
  const { id } = await ctx.params;
  const uid = Number(id);
  if (uid === admin.id) return json({ error: "you can't delete your own account" }, 400);

  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(uid);
  if (!target) return json({ error: "user not found" }, 404);

  // Wipe mp3s and covers off disk first (no FK to disk; this has to be manual).
  const tracks = db.prepare("SELECT subfolder, filename, cover_subfolder, cover_filename FROM tracks WHERE user_id = ?").all(uid);
  for (const t of tracks) {
    deleteOutputFile(t.subfolder, t.filename);
    if (t.cover_filename) deleteOutputFile(t.cover_subfolder, t.cover_filename);
  }
  db.prepare("DELETE FROM tracks WHERE user_id = ?").run(uid);
  db.prepare("DELETE FROM playlists WHERE user_id = ?").run(uid);
  db.prepare("DELETE FROM users WHERE id = ?").run(uid);
  return json({ ok: true });
});
