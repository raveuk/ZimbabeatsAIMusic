// POST /api/training/auto-label — for every sample in the user's active
// dataset (or only unlabeled ones), run the same Granite ASR pipeline we
// already use for the Transcribe button (Phase 1) to extract lyrics, then
// ask Ollama for tags/genre/bpm/key/language/instrumental in one structured
// JSON response. Updates samples_json in place and returns the rebuilt
// dataframe so the UI table refreshes.
//
// Body: {
//   datasetId?,                   // explicit dataset to label (else use the
//                                 //   most recent owned by the user)
//   indices?: number[],           // limit to specific sample indices
//   onlyUnlabeled?: boolean,      // skip samples that already have tags+lyrics
//   transcribeLyrics?: boolean,   // run ASR on each audio (~10s each)
//   formatLyrics?: boolean,       // re-section the ASR output as [verse]/[chorus]
//   skipMetas?: boolean,          // skip the Ollama tag-generation pass
// }
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { json, handler, requireUser } from "../../../../lib/api.js";
import { db } from "../../../../lib/db.js";
import { autoLabelSample, formatLyricsForTraining } from "../../../../lib/ollama.js";
import { buildTranscribeGraph, transcribeAvailable, TRANSCRIBE_TEXT_NODE } from "../../../../lib/workflow.js";
import { submitPrompt, getHistory } from "../../../../lib/comfy.js";
import { INPUT_DIR } from "../../../../lib/uploads.js";
import { buildDataframe } from "../../../../lib/training_storage.js";
import { safePathUnderDatasetsRoot } from "../../../../lib/training.js";

const POLL_INTERVAL_MS = 2000;
const POLL_DEADLINE_MS = 12 * 60 * 1000;

// Stage a dataset audio into ComfyUI/input/ under a transient name, run
// Granite ASR via the existing transcribe workflow, return the lyric text.
async function transcribeDatasetAudio(absAudioPath) {
  if (!fs.existsSync(absAudioPath)) throw new Error(`audio missing: ${absAudioPath}`);
  const ext = (path.extname(absAudioPath) || ".mp3").toLowerCase();
  const transientName = `autolabel_${crypto.randomBytes(6).toString("hex")}${ext}`;
  const stagedPath = path.join(INPUT_DIR, transientName);
  fs.copyFileSync(absAudioPath, stagedPath);

  try {
    const built = buildTranscribeGraph({ audioInputFile: transientName });
    if (!built) throw new Error("transcribe graph unavailable");
    const { prompt_id } = await submitPrompt(built.graph);
    const deadline = Date.now() + POLL_DEADLINE_MS;
    let entry = null;
    while (Date.now() < deadline) {
      entry = await getHistory(prompt_id);
      const s = entry?.status?.status_str;
      if (s === "success" || s === "error") break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    if (entry?.status?.status_str !== "success") {
      throw new Error("ASR failed: " + (entry?.status?.messages?.[0]?.[1]?.exception_message || "unknown"));
    }
    return entry.outputs?.[TRANSCRIBE_TEXT_NODE]?.text?.[0] || "";
  } finally {
    try { fs.unlinkSync(stagedPath); } catch {}
  }
}

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));

  // Resolve dataset row.
  let row = null;
  if (body.datasetId) {
    row = db.prepare("SELECT * FROM lora_datasets WHERE id = ? AND user_id = ?")
      .get(Number(body.datasetId), user.id);
  } else {
    row = db.prepare("SELECT * FROM lora_datasets WHERE user_id = ? ORDER BY id DESC LIMIT 1")
      .get(user.id);
  }
  if (!row) return json({ error: "no dataset to label — build one first" }, 404);

  let samples = [];
  try { samples = JSON.parse(row.samples_json || "[]"); } catch {}
  if (!samples.length) return json({ error: "dataset has no samples" }, 400);

  const transcribeOn = !!body.transcribeLyrics && transcribeAvailable();
  const formatOn    = !!body.formatLyrics;
  const skipMetas   = !!body.skipMetas;
  const onlyUnlab   = !!body.onlyUnlabeled;

  // Pick which indices to process.
  let indices = Array.isArray(body.indices) && body.indices.length
    ? body.indices.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < samples.length)
    : samples.map((_, i) => i);
  if (onlyUnlab) indices = indices.filter((i) => !samples[i].tags || !samples[i].lyrics);
  if (!indices.length) return json({ ok: true, processed: 0, status: "Nothing to label", dataframe: buildDataframe(samples) });

  // Cap a single call so the request doesn't hang forever — the UI can
  // re-run for the next batch.
  const MAX_PER_CALL = 50;
  if (indices.length > MAX_PER_CALL) indices = indices.slice(0, MAX_PER_CALL);

  // Per-sample dir for resolving its audio path (samples are stored
  // relative-to-dataset; absolute path is dataset_path + filename).
  const datasetAbs = row.dataset_path
    ? row.dataset_path
    : safePathUnderDatasetsRoot(user.id, row.name);

  const errors = [];
  let processed = 0;
  for (const i of indices) {
    const s = samples[i];
    const audioRel = (s.audio && typeof s.audio === "object" ? s.audio.path : null)
                  || s.filename;
    const audioAbs = path.isAbsolute(audioRel) ? audioRel : path.join(datasetAbs, audioRel);
    try {
      // 1. Transcribe lyrics if asked + not already populated when onlyUnlab.
      if (transcribeOn && (!onlyUnlab || !s.lyrics)) {
        const text = await transcribeDatasetAudio(audioAbs);
        s.rawLyrics = text;
        s.lyrics = formatOn ? await formatLyricsForTraining(text).catch(() => text) : text;
        s.instrumental = !(text && text.trim().length > 4);
        if (!s.instrumental && !s.language) s.language = "en";
      }
      // 2. Tag generation via Ollama.
      if (!skipMetas && (!onlyUnlab || !s.tags)) {
        const meta = await autoLabelSample({ filename: s.filename, lyrics: s.lyrics });
        if (meta.tags)        s.tags = String(meta.tags);
        if (meta.genre)       s.genre = String(meta.genre);
        if (Number.isFinite(meta.bpm)) s.bpm = Math.round(Number(meta.bpm));
        if (meta.key)         s.key = String(meta.key);
        if (meta.language)    s.language = String(meta.language);
        if (typeof meta.instrumental === "boolean") s.instrumental = meta.instrumental;
        // Caption mirrors tags for the UI table convenience.
        if (!s.caption && meta.tags) s.caption = String(meta.tags);
      }
      processed += 1;
      samples[i] = s;
    } catch (e) {
      errors.push({ idx: i, error: String(e.message || e).slice(0, 200) });
    }
  }

  // Persist.
  db.prepare("UPDATE lora_datasets SET samples_json = ? WHERE id = ?")
    .run(JSON.stringify(samples), row.id);

  return json({
    ok: true,
    processed,
    errors,
    dataframe: buildDataframe(samples),
    status: `Auto-labeled ${processed}/${indices.length} sample${indices.length === 1 ? "" : "s"}${errors.length ? ` — ${errors.length} failed` : ""}`,
  });
});
