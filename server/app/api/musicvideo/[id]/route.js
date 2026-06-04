// GET /api/musicvideo/[id] — poll one music video job. Refreshes the row
// from ComfyUI's /history on the way out, so calling this is enough to
// drive the row to its final state.
import { json, handler, requireUser } from "../../../../lib/api.js";
import { db } from "../../../../lib/db.js";
import { refreshMusicVideo, publicMusicVideo } from "../../../../lib/musicvideo.js";

export const GET = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const row = db.prepare("SELECT * FROM music_videos WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id);
  if (!row) return json({ error: "video not found" }, 404);
  const fresh = await refreshMusicVideo(row);
  return json({ video: publicMusicVideo(fresh) });
});

export const DELETE = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const row = db.prepare("SELECT * FROM music_videos WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id);
  if (!row) return json({ error: "video not found" }, 404);
  // Soft delete: drop the DB row. Output file stays on disk for now —
  // separate sweep can prune orphans later.
  db.prepare("DELETE FROM music_videos WHERE id = ?").run(row.id);
  return json({ ok: true });
});
