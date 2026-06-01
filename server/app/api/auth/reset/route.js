import { consumeResetToken } from "../../../../lib/auth.js";
import { json, handler } from "../../../../lib/api.js";

export const POST = handler(async (req) => {
  const { token, password } = await req.json();
  if (!password || password.length < 6) {
    return json({ error: "password must be at least 6 characters" }, 400);
  }
  if (!consumeResetToken(token, password)) {
    return json({ error: "this reset link is invalid or has expired" }, 400);
  }
  return json({ ok: true });
});
