import { db } from "../../../../../lib/db.js";
import { requireUser, json, handler } from "../../../../../lib/api.js";

// Flip a track's is_public bit. POST body: { isPublic: boolean }, or POST
// with no body to toggle. Returns the new value so the UI can update.
export const PATCH = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;

  const row = db.prepare("SELECT id, user_id, is_public FROM tracks WHERE id = ?").get(Number(id));
  if (!row || row.user_id !== user.id) return json({ error: "not found" }, 404);

  let next;
  try {
    const body = await req.json();
    next = body.isPublic === undefined ? !row.is_public : !!body.isPublic;
  } catch {
    next = !row.is_public;
  }
  db.prepare("UPDATE tracks SET is_public = ? WHERE id = ?").run(next ? 1 : 0, row.id);
  return json({ id: row.id, isPublic: !!next });
});
