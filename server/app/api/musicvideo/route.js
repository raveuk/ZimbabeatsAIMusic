// GET  /api/musicvideo — list the caller's music videos (newest first).
// POST /api/musicvideo — create a new music video job:
//   body: { trackId, imageUploadId, stylePrompt, length? (seconds), width?, height? }
//
// Stages the source track audio + the image into ComfyUI's input dir, submits
// the workflow, returns { videoId, promptId }. Long-poll-friendly status
// lives on the [id] route.
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../lib/api.js";
import { db } from "../../../lib/db.js";
import { buildMusicVideoGraph, musicVideoAvailable } from "../../../lib/workflow.js";
import { submitPrompt } from "../../../lib/comfy.js";
import { titleSlug } from "../../../lib/files.js";
import { stageBuffer, getUploadForUser, INPUT_DIR } from "../../../lib/uploads.js";

const COMFYUI_ROOT = process.env.COMFYUI_ROOT || "/home/raveuk/comfy/ComfyUI";
const OUTPUT_DIR   = path.join(COMFYUI_ROOT, "output", "music_app");

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const rows = db.prepare(
    `SELECT mv.*, t.title AS trackTitle
     FROM music_videos mv
     LEFT JOIN tracks t ON t.id = mv.track_id
     WHERE mv.user_id = ?
     ORDER BY mv.id DESC LIMIT 100`
  ).all(user.id);
  return json({
    videos: rows.map((r) => ({
      id: r.id,
      trackId: r.track_id,
      trackTitle: r.trackTitle,
      imageUploadId: r.image_upload_id,
      stylePrompt: r.style_prompt,
      status: r.status,
      filename: r.filename,
      subfolder: r.subfolder,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      videoUrl: r.filename ? `/api/musicvideo/${r.id}/file` : null,
    })),
  });
});

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  if (!musicVideoAvailable()) return json({ error: "music video workflow not configured" }, 500);

  const body = await req.json().catch(() => ({}));
  const trackId       = Number(body.trackId);
  const imageUploadId = Number(body.imageUploadId);
  const stylePrompt   = String(body.stylePrompt || "").trim();

  if (!Number.isInteger(trackId) || trackId <= 0)
    return json({ error: "trackId required" }, 400);
  if (!Number.isInteger(imageUploadId) || imageUploadId <= 0)
    return json({ error: "imageUploadId required" }, 400);

  // Quota.
  if (user.musicvideo_quota != null) {
    const count = db.prepare("SELECT COUNT(*) AS n FROM music_videos WHERE user_id = ? AND status != 'error'")
      .get(user.id).n;
    if (count >= user.musicvideo_quota)
      return json({ error: `music video quota reached (${count}/${user.musicvideo_quota})` }, 403);
  }

  // Concurrency — Wan 2.2 14B saturates the GPU; refuse if one's already
  // running for this user.
  const inflight = db.prepare(
    "SELECT id FROM music_videos WHERE user_id = ? AND status IN ('queued','running')"
  ).get(user.id);
  if (inflight) return json({ error: "a music video is already generating", videoId: inflight.id }, 429);

  // Resolve track + verify ownership + materialise its audio into input/.
  const track = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(trackId, user.id);
  if (!track) return json({ error: "track not found" }, 404);
  if (track.status !== "done" || !track.filename) return json({ error: "track not finished" }, 400);
  const trackAbs = path.join(OUTPUT_DIR, track.filename);
  if (!fs.existsSync(trackAbs)) return json({ error: "audio file missing on disk" }, 410);
  const audioBuf = fs.readFileSync(trackAbs);
  let stagedAudio;
  try {
    stagedAudio = stageBuffer({
      buf: audioBuf, userId: user.id,
      originalName: track.title || track.filename,
      mime: "audio/mpeg", source: "musicvideo-audio", trackId: track.id,
    });
  } catch (e) {
    return json({ error: e.message || "could not stage track audio" }, e.status || 500);
  }

  // Verify image upload belongs to user + file present.
  const img = getUploadForUser(imageUploadId, user.id);
  if (!img) return json({ error: "image upload not found" }, 404);
  if (!fs.existsSync(path.join(INPUT_DIR, img.filename)))
    return json({ error: "image file missing — re-upload" }, 410);

  // Length: user gives seconds, we convert to frames at 16 fps.
  const FPS = 16;
  const seconds = Number(body.length) || 5;
  const lengthFrames = Math.max(16, Math.min(241, Math.round(seconds * FPS)));

  // Reserve a row early so we can use its id in the filename prefix.
  const slug = titleSlug(track.title);
  const params = {
    trackId: track.id, imageUploadId, stylePrompt, lengthFrames,
    width: Number(body.width) || 640, height: Number(body.height) || 640, fps: FPS,
  };
  const ins = db.prepare(
    `INSERT INTO music_videos
     (user_id, track_id, image_upload_id, style_prompt, params_json, status)
     VALUES (?, ?, ?, ?, ?, 'queued')`
  ).run(user.id, track.id, imageUploadId, stylePrompt, JSON.stringify(params));
  const videoId = Number(ins.lastInsertRowid);

  const built = buildMusicVideoGraph({
    audioInputFile: stagedAudio.filename,
    imageInputFile: img.filename,
    positivePrompt: stylePrompt,
    width: params.width, height: params.height,
    lengthFrames: params.lengthFrames, fps: FPS,
    filenamePrefix: `music_app/musicvideo_u${user.id}_v${videoId}${slug ? `_${slug}` : ""}`,
  });
  if (!built) {
    db.prepare("UPDATE music_videos SET status='error', error_message=? WHERE id=?")
      .run("could not build graph", videoId);
    return json({ error: "could not build music video graph" }, 500);
  }

  try {
    const { prompt_id } = await submitPrompt(built.graph);
    db.prepare("UPDATE music_videos SET prompt_id=?, status='running' WHERE id=?")
      .run(prompt_id, videoId);
    return json({ videoId, promptId: prompt_id, lengthFrames: built.lengthFrames });
  } catch (e) {
    db.prepare("UPDATE music_videos SET status='error', error_message=? WHERE id=?")
      .run(String(e.detail ?? e.message ?? e).slice(0, 800), videoId);
    return json({ error: "ComfyUI rejected the workflow", detail: e.detail ?? String(e) }, 502);
  }
});
