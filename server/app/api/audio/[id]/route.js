import NodeID3 from "node-id3";
import { db } from "../../../../lib/db.js";
import { requireUser, json, handler } from "../../../../lib/api.js";
import { refreshTrack } from "../../../../lib/tracks.js";
import { fetchAudio } from "../../../../lib/comfy.js";
import { readOutputFile } from "../../../../lib/files.js";

// Stream the finished mp3, with ID3 tags (title + album art) embedded so users'
// music players show the cover after they download the file. We read both
// files straight off disk (we're on the same machine as ComfyUI), fall back to
// ComfyUI's /view if the disk read fails.
export const GET = handler(async (req, ctx) => {
  const user = requireUser(req);
  const { id } = await ctx.params;
  let row = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(Number(id), user.id);
  if (!row) return json({ error: "not found" }, 404);
  if (row.status !== "done") row = await refreshTrack(row);
  if (row.status !== "done" || !row.filename) return json({ error: "not ready" }, 409);

  // Try disk first. If that fails (env var mismatch / different host), stream
  // straight from ComfyUI unmodified — at least the audio still plays.
  let mp3 = readOutputFile(row.subfolder, row.filename);
  if (!mp3) {
    const upstream = await fetchAudio(row.filename, row.subfolder);
    if (!upstream.ok) return json({ error: "audio unavailable" }, 502);
    return new Response(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") || "audio/mpeg",
        "content-disposition": `inline; filename="${row.filename}"`,
        "cache-control": "private, max-age=3600",
      },
    });
  }

  // Embed ID3v2 tags. Album art (APIC frame) shows in music players after download.
  const tags = {
    title: row.title || `Track #${row.id}`,
    artist: "AI Music",
    album: "AI Music",
  };
  if (row.cover_filename) {
    const cover = readOutputFile(row.cover_subfolder, row.cover_filename);
    if (cover) {
      tags.APIC = {
        mime: row.cover_filename.toLowerCase().endsWith(".jpg") || row.cover_filename.toLowerCase().endsWith(".jpeg")
          ? "image/jpeg" : "image/png",
        type: { id: 3, name: "front cover" },
        description: "Cover",
        imageBuffer: cover,
      };
    }
  }
  const tagged = NodeID3.write(tags, mp3);

  return new Response(tagged, {
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(tagged.length),
      "content-disposition": `inline; filename="${row.filename}"`,
      "cache-control": "private, max-age=3600",
    },
  });
});
