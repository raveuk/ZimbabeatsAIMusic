import { db } from "../../../../lib/db.js";
import { requireUser, json, handler } from "../../../../lib/api.js";
import { refreshTrack } from "../../../../lib/tracks.js";

const COMFY_URL = process.env.COMFY_URL || "http://127.0.0.1:8188";

// Stream the cover image for one of the user's tracks. Mirrors the audio
// endpoint but pulls the PNG from ComfyUI's /view (type=output).
export const GET = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  let row = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(Number(id), user.id);
  if (!row) return json({ error: "not found" }, 404);
  // Try to materialise it if we haven't checked yet — covers may finish before audio.
  if (!row.cover_filename) row = await refreshTrack(row);
  if (!row.cover_filename) return json({ error: "no cover yet" }, 409);

  const url = new URL(`${COMFY_URL}/view`);
  url.searchParams.set("filename", row.cover_filename);
  if (row.cover_subfolder) url.searchParams.set("subfolder", row.cover_subfolder);
  url.searchParams.set("type", "output");
  const upstream = await fetch(url);
  if (!upstream.ok) return json({ error: "cover unavailable" }, 502);
  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") || "image/png",
      "content-disposition": `inline; filename="${row.cover_filename}"`,
      "cache-control": "private, max-age=86400",
    },
  });
});
