import fs from "node:fs";
import path from "node:path";
import { db } from "../../../../../lib/db.js";
import { requireUser, json, handler } from "../../../../../lib/api.js";
import { titleSlug } from "../../../../../lib/files.js";

const COMFYUI_ROOT = process.env.COMFYUI_ROOT || "/home/raveuk/comfy/ComfyUI";
const OUTPUT_DIR = path.join(COMFYUI_ROOT, "output", "music_app");
const ALLOWED_STEMS = new Set(["vocals", "bass", "drums", "other"]);

// Stream a single stem mp3 to the client. Owner-only access; same ?token=…
// query-param fallback the other media endpoints use so <audio>/<a download>
// elements can authenticate without setting an Authorization header.
export const GET = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id, stem } = await ctx.params;
  if (!ALLOWED_STEMS.has(String(stem))) return json({ error: "unknown stem" }, 400);

  const row = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(Number(id), user.id);
  if (!row) return json({ error: "not found" }, 404);

  // ComfyUI's SaveAudioMP3 appends _NNNNN_ to the prefix. We don't know
  // the exact suffix, so scan for it.
  const slug = titleSlug(row.title);
  const prefix = `u${user.id}_t${row.id}${slug ? `_${slug}` : ""}_stems_${stem}_`;
  let filename = null;
  try {
    filename = fs.readdirSync(OUTPUT_DIR)
      .find((f) => f.startsWith(prefix) && f.endsWith(".mp3"));
  } catch {}
  if (!filename) return json({ error: "stem file not generated yet" }, 404);

  const filePath = path.join(OUTPUT_DIR, filename);
  // Path-traversal guard (filename came from a controlled scan but be safe).
  if (!path.resolve(filePath).startsWith(OUTPUT_DIR + path.sep)) {
    return json({ error: "forbidden" }, 403);
  }
  const data = fs.readFileSync(filePath);
  return new Response(data, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, max-age=300",
    },
  });
});
