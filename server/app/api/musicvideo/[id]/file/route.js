// GET /api/musicvideo/[id]/file — stream the finished MP4 back to the
// browser's <video> tag. Like the /api/audio route, we pull from ComfyUI's
// `/view?filename=...&type=output` and pipe through.
import { json, handler, requireUser } from "../../../../../lib/api.js";
import { db } from "../../../../../lib/db.js";

const COMFY_URL = process.env.COMFY_URL || "http://127.0.0.1:8188";

export const GET = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const row = db.prepare("SELECT * FROM music_videos WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id);
  if (!row) return json({ error: "video not found" }, 404);
  if (!row.filename) return json({ error: "video not yet rendered" }, 409);

  const url = new URL(`${COMFY_URL}/view`);
  url.searchParams.set("filename", row.filename);
  if (row.subfolder) url.searchParams.set("subfolder", row.subfolder);
  url.searchParams.set("type", "output");
  const upstream = await fetch(url);
  if (!upstream.ok) return json({ error: "video unavailable" }, 502);

  const ct = upstream.headers.get("content-type")
    || (/\.webm$/i.test(row.filename) ? "video/webm" : "video/mp4");
  return new Response(upstream.body, {
    headers: {
      "content-type": ct,
      "content-disposition": `inline; filename="${row.filename}"`,
      "cache-control": "private, max-age=3600",
    },
  });
});
