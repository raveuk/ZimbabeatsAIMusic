import { db } from "../../../lib/db.js";
import { requireUser, json, handler } from "../../../lib/api.js";
import { buildGraph, buildCoverGraph, coverAvailable } from "../../../lib/workflow.js";
import { submitPrompt } from "../../../lib/comfy.js";
import { titleSlug } from "../../../lib/files.js";
import { generateLyrics } from "../../../lib/ollama.js";

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await req.json();
  const writeLyrics = !!body.writeLyrics;
  if (!body.style && !body.lyrics && !(writeLyrics && body.theme)) {
    return json({ error: "provide a style, lyrics, or a theme for AI lyrics" }, 400);
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
    shift: body.shift,             // ModelSamplingAuraFlow shift (advanced)
    quality: body.quality,         // MP3 bitrate: "V0" | "128k" | "320k"
    ditModel: body.ditModel,       // "studio" (XL SFT) | "turbo" — picks UNET file
    voiceModel: body.voiceModel ?? null, // trained RVC voice (.pth filename) or null
  };
  const info = db
    .prepare("INSERT INTO tracks (user_id, title, params_json, status) VALUES (?, ?, ?, 'queued')")
    .run(user.id, body.title || null, JSON.stringify(params));
  const trackId = Number(info.lastInsertRowid);

  // Name the file with the title (when given) so it's identifiable on disk.
  const slug = titleSlug(body.title);
  const { graph, seed, duration } = buildGraph({
    ...params,
    filenamePrefix: `music_app/u${user.id}_t${trackId}${slug ? `_${slug}` : ""}`,
  });

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
