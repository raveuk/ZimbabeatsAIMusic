import { db } from "../../../../lib/db.js";
import { createResetToken } from "../../../../lib/auth.js";
import { sendResetEmail } from "../../../../lib/mailer.js";
import { json, handler } from "../../../../lib/api.js";

export const POST = handler(async (req) => {
  const { email } = await req.json();
  const user = email
    ? db.prepare("SELECT id, email FROM users WHERE email = ?").get(email.toLowerCase())
    : null;

  // Only do work for a real user, but ALWAYS return the same response so we
  // don't leak which emails are registered.
  if (user) {
    const token = createResetToken(user.id);
    const origin = process.env.APP_URL || new URL(req.url).origin;
    const link = `${origin}/reset?token=${token}`;
    try {
      await sendResetEmail(user.email, link);
    } catch (e) {
      console.error("reset email failed:", e?.message || e);
      // Still return ok — don't expose mail-server state to the client.
    }
  }
  return json({ ok: true });
});
