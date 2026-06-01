// Small helpers shared by route handlers.
import { userFromRequest } from "./auth.js";

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

// Returns the user or throws a Response (caught by the route) when unauthorized.
// A disabled account is rejected even with a valid token — the app sees 403
// and the next /api/me poll logs them out automatically.
// Async because Firebase ID-token verification involves a key-set fetch the
// first time and a signature check every time.
export async function requireUser(req) {
  const user = await userFromRequest(req);
  if (!user) throw json({ error: "unauthorized" }, 401);
  if (user.disabled) throw json({ error: "account disabled" }, 403);
  return user;
}

// Same as requireUser but additionally rejects non-admins with 403.
export async function requireAdmin(req) {
  const user = await requireUser(req);
  if (user.role !== "admin") throw json({ error: "admin only" }, 403);
  return user;
}

// Wrap a handler so a thrown Response is returned and other errors become 500s.
export function handler(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error(e);
      return json({ error: "server_error", detail: String(e?.message || e) }, 500);
    }
  };
}
