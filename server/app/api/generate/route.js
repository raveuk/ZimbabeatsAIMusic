import { db } from "../../../lib/db.js";
import { requireUser, json, handler } from "../../../lib/api.js";
import path from "node:path";
import {
  buildGraph, buildCoverGraph, coverAvailable,
  buildCoverAudioGraph, coverAudioAvailable,
  buildExtendGraph, extendAvailable,
  buildRepaintGraph, repaintAvailable,
  buildEditGraph, editAvailable,
} from "../../../lib/workflow.js";
import { submitPrompt } from "../../../lib/comfy.js";
import { titleSlug } from "../../../lib/files.js";
import { generateLyrics } from "../../../lib/ollama.js";
import { getUploadForUser, INPUT_DIR } from "../../../lib/uploads.js";
import { probeDuration } from "../../../lib/audio_duration.js";

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await req.json();
  const writeLyrics = !!body.writeLyrics;

  // Cover (audio→music) is a separate task path: requires an uploaded source
  // audio plus a style prompt. Lyrics aren't required because the diffusers
  // pipeline carries them over from the source. Validate before doing anything
  // else so we don't end up with a half-recorded track row.
  const taskType = String(body.taskType || "text2music");
  let coverUpload = null;
  let extendUpload = null;
  let extendSourceDuration = 0;
  if (taskType === "cover") {
    if (!coverAudioAvailable()) return json({ error: "cover workflow not configured" }, 500);
    if (!body.style) return json({ error: "cover requires a style prompt to redirect the rendering" }, 400);
    if (!body.uploadId) return json({ error: "cover requires `uploadId` (source audio)" }, 400);
    coverUpload = getUploadForUser(Number(body.uploadId), user.id);
    if (!coverUpload) return json({ error: "upload not found" }, 404);
  } else if (taskType === "extend") {
    if (!extendAvailable()) return json({ error: "extend workflow not configured" }, 500);
    if (!body.uploadId) return json({ error: "extend requires `uploadId` (source audio)" }, 400);
    extendUpload = getUploadForUser(Number(body.uploadId), user.id);
    if (!extendUpload) return json({ error: "upload not found" }, 404);
    // Probe the staged file with ffprobe so we know where to splice. Cached
    // tracks could also pull duration from their params row, but ffprobe is
    // authoritative for both upload sources without branching.
    extendSourceDuration = await probeDuration(path.join(INPUT_DIR, extendUpload.filename));
    if (!extendSourceDuration) {
      return json({ error: "could not measure source duration (ffprobe failed)" }, 502);
    }
  } else if (taskType === "repaint") {
    if (!repaintAvailable()) return json({ error: "repaint workflow not configured" }, 500);
    if (!body.uploadId) return json({ error: "repaint requires `uploadId` (source audio)" }, 400);
    var repaintUpload = getUploadForUser(Number(body.uploadId), user.id);
    if (!repaintUpload) return json({ error: "upload not found" }, 404);
    var repaintSourceDuration = await probeDuration(path.join(INPUT_DIR, repaintUpload.filename));
    if (!repaintSourceDuration) {
      return json({ error: "could not measure source duration (ffprobe failed)" }, 502);
    }
  } else if (taskType === "edit") {
    if (!editAvailable()) return json({ error: "edit workflow not configured" }, 500);
    if (!body.uploadId) return json({ error: "edit requires `uploadId` (source audio)" }, 400);
    if (!body.lyrics || !String(body.lyrics).trim()) {
      return json({ error: "edit requires new lyrics to render" }, 400);
    }
    var editUpload = getUploadForUser(Number(body.uploadId), user.id);
    if (!editUpload) return json({ error: "upload not found" }, 404);
    var editSourceDuration = await probeDuration(path.join(INPUT_DIR, editUpload.filename));
    if (!editSourceDuration) {
      return json({ error: "could not measure source duration (ffprobe failed)" }, 502);
    }
  } else if (!body.style && !body.lyrics && !(writeLyrics && body.theme)) {
    return json({ error: "provide a style, lyrics, or a theme for AI lyrics" }, 400);
  }

  // Phase 8 — Track Classes augmentation. The diffusers pipeline only exposes
  // `complete_track_classes` for task_type=complete (which needs source audio),
  // so for the common case (text2music with "only piano + drums") we just
  // append the picked instruments to the style tags. ACE-Step's text encoder
  // is tag-driven, so this lands as a strong instrument-palette hint.
  if (Array.isArray(body.completeTrackClasses) && body.completeTrackClasses.length > 0) {
    const classes = body.completeTrackClasses
      .map((s) => String(s || "").trim().toLowerCase())
      .filter(Boolean);
    if (classes.length) {
      const baseStyle = String(body.style || "").trim();
      body.style = baseStyle ? `${baseStyle}, ${classes.join(", ")}` : classes.join(", ");
    }
  }

  // Per-user quota (set by the admin). NULL = unlimited.
  if (user.track_quota != null) {
    const count = db.prepare("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ?").get(user.id).n;
    if (count >= user.track_quota) {
      return json({ error: `track limit reached (${count}/${user.track_quota}). Delete an old one to make room.` }, 403);
    }
  }

  // AI lyrics: have the local LLM write them from the theme first, so a model
  // failure returns a clean error instead of leaving an orphaned track row.
  // If the app already previewed (and possibly edited) the lyrics, use them as-is.
  // Only fall back to generating here when AI lyrics were asked for but none were sent.
  let lyrics = body.lyrics ?? "";
  if (writeLyrics && body.theme && !lyrics.trim()) {
    try {
      lyrics = await generateLyrics(body.theme, body.language);
    } catch (e) {
      return json({ error: "lyric generation failed", detail: String(e.message || e) }, 502);
    }
  }

  // Reserve a track row first so we can use its id in the filename prefix.
  const params = {
    style: body.style ?? "",
    lyrics, // typed, or the AI-written text — stored so it shows in the app
    writeLyrics,
    theme: body.theme ?? "",
    duration: body.duration,
    seed: body.seed,
    bpm: body.bpm,
    key: body.key,
    language: body.language,
    timesignature: body.timesignature,
    steps: body.steps,             // KSampler iterations (advanced)
    temperature: body.temperature, // vocal pronunciation confidence (advanced)
    cfgScale: body.cfgScale,       // LM cfg_scale on TextEncodeAceStepAudio1.5
    topP: body.topP,               // LM top_p
    topK: body.topK,               // LM top_k (0 = disabled)
    shift: body.shift,             // ModelSamplingAuraFlow shift (advanced)
    quality: body.quality,         // MP3 bitrate: "V0" | "128k" | "320k"
    ditModel: body.ditModel,       // "studio" (XL SFT) | "turbo" — picks UNET file
    voiceModel: body.voiceModel ?? null, // trained RVC voice (.pth filename) or null
    taskType,                              // "text2music" | "cover" | …
    uploadId: body.uploadId ?? null,       // staged source audio for cover/repaint/…
    audioCoverStrength: body.audioCoverStrength, // 0 = identical, 1 = full re-stylize
    repaintingStart: body.repaintingStart,
    repaintingEnd:   body.repaintingEnd,
    trackName: body.trackName,             // for edit / extract: "vocals"|"drums"|etc
    cfgIntervalStart: body.cfgIntervalStart,
    cfgIntervalEnd:   body.cfgIntervalEnd,
  };
  const info = db
    .prepare("INSERT INTO tracks (user_id, title, params_json, status) VALUES (?, ?, ?, 'queued')")
    .run(user.id, body.title || null, JSON.stringify(params));
  const trackId = Number(info.lastInsertRowid);

  // Name the file with the title (when given) so it's identifiable on disk.
  const slug = titleSlug(body.title);
  const filenamePrefix = `music_app/u${user.id}_t${trackId}${slug ? `_${slug}` : ""}`;

  // Dispatch by task type. text2music keeps the existing path (RVC voice
  // cloning + tuned defaults). cover/extend route through the diffusers
  // pipeline wrapper via AceStepGenerate.
  let built;
  if (taskType === "cover") {
    built = buildCoverAudioGraph({
      ...params, audioInputFile: coverUpload.filename, filenamePrefix,
    });
  } else if (taskType === "extend") {
    built = buildExtendGraph({
      ...params,
      audioInputFile: extendUpload.filename,
      sourceDuration: extendSourceDuration,
      extendBy: body.duration,   // duration field doubles as "extend by N seconds"
      filenamePrefix,
    });
  } else if (taskType === "repaint") {
    built = buildRepaintGraph({
      ...params,
      audioInputFile: repaintUpload.filename,
      sourceDuration: repaintSourceDuration,
      repaintingStart: body.repaintingStart,
      repaintingEnd:   body.repaintingEnd,
      filenamePrefix,
    });
  } else if (taskType === "edit") {
    built = buildEditGraph({
      ...params,
      audioInputFile: editUpload.filename,
      sourceDuration: editSourceDuration,
      repaintingStart: body.repaintingStart,
      repaintingEnd:   body.repaintingEnd,
      trackName: body.trackName || "vocals",
      filenamePrefix,
    });
  } else {
    built = buildGraph({ ...params, filenamePrefix });
  }
  const { graph, seed, duration } = built;

  try {
    const { prompt_id } = await submitPrompt(graph);
    db.prepare("UPDATE tracks SET prompt_id = ?, status = 'running' WHERE id = ?").run(prompt_id, trackId);

    // Cover art runs as its own ComfyUI prompt, in parallel with the audio.
    // It's fast (~5–8s on the 3090) and finishes long before the song. Failures
    // here MUST NOT kill the audio job — the song stays usable without a cover.
    let coverPromptId = null;
    if (coverAvailable()) {
      try {
        const cover = buildCoverGraph({
          ...params,
          coverFilenamePrefix: `music_app/u${user.id}_t${trackId}${slug ? `_${slug}` : ""}_cover`,
        });
        if (cover) {
          const { prompt_id: cpid } = await submitPrompt(cover.graph);
          coverPromptId = cpid;
          db.prepare("UPDATE tracks SET cover_prompt_id = ? WHERE id = ?").run(cpid, trackId);
        }
      } catch (e) {
        console.error("cover submit failed (non-fatal):", e?.message || e);
      }
    }

    return json({ trackId, promptId: prompt_id, coverPromptId, seed, duration });
  } catch (e) {
    db.prepare("UPDATE tracks SET status = 'error' WHERE id = ?").run(trackId);
    return json({ error: "ComfyUI rejected the workflow", detail: e.detail ?? String(e) }, 502);
  }
});
