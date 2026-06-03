// GET /api/training/audio?path=<absolute-or-relative> — streams a training
// audio file back to the UI's <audio> tag. The frontend's
// getTrainingAudioUrl() builds the URL from a sample's audio.path.
//
// Path safety: the supplied path must resolve under server/data/datasets/.
// Any escape attempt returns 400.
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../lib/api.js";
import { DATASETS_ROOT } from "../../../../lib/training.js";

const CONTENT_TYPES = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".m4a": "audio/mp4",
};

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const url = new URL(req.url);
  const rel = url.searchParams.get("path") || "";
  if (!rel) return json({ error: "path required" }, 400);

  // We expose audio strictly from the requesting user's datasets dir. If the
  // caller sends an absolute path (legacy Gradio shape), pin to the per-user
  // root before resolving; if relative, do the same.
  const userRoot = path.join(DATASETS_ROOT, `u${user.id}`);
  fs.mkdirSync(userRoot, { recursive: true });
  const resolved = path.resolve(userRoot, rel.replace(/^\/+/, ""));
  const userRootResolved = fs.realpathSync(userRoot);
  if (!resolved.startsWith(userRootResolved + path.sep) && resolved !== userRootResolved) {
    return json({ error: "path escapes the per-user dataset root" }, 400);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return json({ error: "audio not found" }, 404);
  }

  const ext = path.extname(resolved).toLowerCase();
  const body = fs.readFileSync(resolved);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": CONTENT_TYPES[ext] || "application/octet-stream",
      "content-length": String(body.length),
      "cache-control": "private, max-age=300",
    },
  });
});
