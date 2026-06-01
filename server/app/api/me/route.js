import { requireUser, json, handler } from "../../../lib/api.js";
import { ensureAdminRole } from "../../../lib/auth.js";

// Current user (id, email, role). Used by the app on launch to decide if the
// Admin tab should appear.
export const GET = handler(async (req) => {
  let user = requireUser(req);
  user = ensureAdminRole(user); // promote on the fly if ADMIN_EMAIL changed
  return json({ user });
});
