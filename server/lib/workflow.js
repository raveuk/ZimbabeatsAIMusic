// Load the API-format workflow template and inject user inputs.
import fs from "node:fs";
import path from "node:path";

function loadTemplate(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf8"));
  } catch {
    return null;
  }
}

const TEMPLATE = loadTemplate("workflow.api.json");

// Node ids in the "Music AI" workflow (see scripts/convert-workflow.mjs output).
const PROMPT_NODE = "94"; // TextEncodeAceStepAudio1.5
const LATENT_NODE = "98"; // EmptyAceStep1.5LatentAudio
const SAMPLER_NODE = "3"; // KSampler
const SAVE_NODE = "107"; // SaveAudioMP3
const UNET_NODE = "104"; // UNETLoader
const SHIFT_NODE = "78"; // ModelSamplingAuraFlow

// Map the dropdown selector (sent by the UI as `ditModel`) to the actual
// safetensors file ComfyUI should load. Unknown values fall through to studio,
// which is the highest-quality option. "studio" stays default-on for new users
// unless they explicitly switch in the UI. Exported so /api/models can build
// the UNET dropdown from this table — single source of truth.
export const MODEL_FILES = {
  studio: "acestep_v1.5_xl_sft_bf16.safetensors",
  turbo:  "acestep_v1.5_turbo.safetensors",
};

// --- Voice cloning (RVC inside the ComfyUI graph) --------------------------
// Optional second template that adds, after VAEDecodeAudio: stem-separation ->
// RVC voice conversion -> remix -> SaveAudioMP3. Used only when the user picks a
// voice. Configure these via env after you build + export the clone workflow
// (see VOICE_CLONING.md). When unset, cloning is simply unavailable and the app
// behaves exactly as before. The ACE node ids (94/98/3) are assumed identical
// in both templates; only the RVC + final-save nodes are template-specific.
const CLONE_TEMPLATE = loadTemplate(process.env.RVC_CLONE_TEMPLATE || "workflow.clone.api.json");
// "203" is the LoadRVCModelNode in our generated workflow.clone.api.json; its
// `model` input picks the .pth filename. Override via env when you re-export
// the clone graph with different node ids.
const RVC_NODE_ID = process.env.RVC_NODE_ID || "203";
const RVC_MODEL_FIELD = process.env.RVC_MODEL_FIELD || "model";
const RVC_SAVE_NODE_ID = process.env.RVC_SAVE_NODE_ID || SAVE_NODE;

// True once the clone template exists and the RVC node id is configured.
export function cloneAvailable() {
  return !!(CLONE_TEMPLATE && RVC_NODE_ID && CLONE_TEMPLATE[RVC_NODE_ID]);
}

export const DEFAULTS = {
  duration: TEMPLATE[LATENT_NODE].inputs.seconds,
  bpm: TEMPLATE[PROMPT_NODE].inputs.bpm,
  language: TEMPLATE[PROMPT_NODE].inputs.language,
  keyscale: TEMPLATE[PROMPT_NODE].inputs.keyscale,
  timesignature: TEMPLATE[PROMPT_NODE].inputs.timesignature,
  steps: TEMPLATE[SAMPLER_NODE].inputs.steps,
  temperature: TEMPLATE[PROMPT_NODE].inputs.temperature,
};

// Allowed dropdown values (from the ACE-Step node's /object_info), surfaced to
// the app via GET /api/options so the client and model never drift apart.
// MP3 quality comes straight from SaveAudioMP3: V0 (best VBR ~220-260kbps),
// 128k (smaller file), 320k (CBR, biggest/cleanest).
export const MP3_QUALITIES = ["V0", "128k", "320k"];
export const OPTIONS = {
  languages: ["ar","az","bg","bn","ca","cs","da","de","el","en","es","fa","fi","fr","he","hi","hr","ht","hu","id","is","it","ja","ko","la","lt","ms","ne","nl","no","pa","pl","pt","ro","ru","sa","sk","sr","sv","sw","ta","te","th","tl","tr","uk","ur","vi","yue","zh","unknown"],
  keys: ["C major","C# major","Db major","D major","D# major","Eb major","E major","F major","F# major","Gb major","G major","G# major","Ab major","A major","A# major","Bb major","B major","C minor","C# minor","Db minor","D minor","D# minor","Eb minor","E minor","F minor","F# minor","Gb minor","G minor","G# minor","Ab minor","A minor","A# minor","Bb minor","B minor"],
  timeSignatures: ["2","3","4","6"],
  qualities: MP3_QUALITIES,
  defaults: {
    steps: TEMPLATE[SAMPLER_NODE].inputs.steps,
    temperature: TEMPLATE[PROMPT_NODE].inputs.temperature,
  },
};

// Build a ready-to-submit graph from the user's request.
// input: { style, lyrics, duration?, seed?, bpm?, key?, language?, steps?, filenamePrefix }
export function buildGraph(input) {
  // Route through the clone graph only when a voice is chosen AND it's set up.
  const useClone = !!input.voiceModel && cloneAvailable();
  const g = structuredClone(useClone ? CLONE_TEMPLATE : TEMPLATE);
  const saveNode = useClone ? RVC_SAVE_NODE_ID : SAVE_NODE;
  const seed =
    Number.isInteger(input.seed) && input.seed >= 0
      ? input.seed
      : Math.floor(Math.random() * 2 ** 31);
  const duration = clamp(Number(input.duration) || DEFAULTS.duration, 5, 240);

  const p = g[PROMPT_NODE].inputs;
  if (input.style != null) p.tags = String(input.style);
  // Lyrics are always a plain string here. When AI-written, the generate route
  // has already produced the text (via lib/ollama.js) and passes it in.
  if (input.lyrics != null) p.lyrics = String(input.lyrics);
  p.seed = seed;
  p.duration = duration;
  if (input.bpm != null) p.bpm = Number(input.bpm);
  if (input.language != null) p.language = String(input.language);
  if (input.key != null) p.keyscale = String(input.key);
  if (input.timesignature != null) p.timesignature = String(input.timesignature);
  // Vocal "crispness" — lower temperature => more confident pronunciation.
  // Sane range is ~0.4–1.2; the template default is 0.7.
  if (input.temperature != null) p.temperature = clamp(Number(input.temperature), 0.2, 1.5);
  // LM sampling knobs on the same TextEncode node. cfg_scale is the LM's
  // own classifier-free guidance (distinct from the diffusion KSampler.cfg).
  // top_p ∈ (0,1]; top_k=0 disables top-k filtering (pure top-p sampling).
  if (input.cfgScale != null) p.cfg_scale = clamp(Number(input.cfgScale), 0.5, 10);
  if (input.topP     != null) p.top_p     = clamp(Number(input.topP),     0.01, 1);
  if (input.topK     != null) p.top_k     = Math.max(0, Math.min(500, Math.floor(Number(input.topK))));

  g[LATENT_NODE].inputs.seconds = duration;
  g[SAMPLER_NODE].inputs.seed = seed;
  if (input.steps != null) g[SAMPLER_NODE].inputs.steps = clamp(Number(input.steps), 1, 60);

  // Switch the UNET model based on the UI's ditModel selection. The graph
  // template ships pointing at studio (XL SFT); flip to turbo when requested.
  const modelFile = MODEL_FILES[String(input.ditModel || "").toLowerCase()] || MODEL_FILES.studio;
  if (g[UNET_NODE]) g[UNET_NODE].inputs.unet_name = modelFile;

  // ModelSamplingAuraFlow.shift — controls how the diffusion sampler
  // redistributes denoising effort across timesteps. Useful for the base/SFT
  // models; the label warns it's not effective for turbo. Clamp to a sane
  // range (1–7 is the practically useful band).
  if (input.shift != null && g[SHIFT_NODE]) {
    g[SHIFT_NODE].inputs.shift = clamp(Number(input.shift), 1, 7);
  }
  // Negative prompt support removed: routing a second TextEncode into
  // KSampler.negative caused reproducible distortion on Studio + cfg=5.
  // The canonical ConditioningZeroOut path stays. See
  // docs/lm-negative-prompt.md for the empirical record.

  g[saveNode].inputs.filename_prefix = input.filenamePrefix || "music_app/track";
  if (input.quality && MP3_QUALITIES.includes(input.quality)) {
    g[saveNode].inputs.quality = input.quality;
  }

  // Point the RVC node at the chosen trained voice model (.pth filename).
  if (useClone) {
    g[RVC_NODE_ID].inputs[RVC_MODEL_FIELD] = String(input.voiceModel);
  }

  return { graph: g, seed, duration, cloned: useClone };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// ---------------------------------------------------------------------------
// Stem separation (Demucs htdemucs). On demand, after a track is done — we
// copy the audio file into ComfyUI's input/ folder, run it through Demucs,
// and save four stems (vocals, bass, drums, other) into output/music_app/
// alongside the original. ~30–60s per track on the 3090.
// ---------------------------------------------------------------------------
const STEMS_TEMPLATE = loadTemplate("workflow.stems.api.json");
const STEMS_LOAD_NODE = "1";       // LoadAudio — input audio filename in ComfyUI's input/ folder
// Save-node id -> stem name. Order must match the workflow JSON's `audio`
// wiring; AudioSeparateDemucs (node 2) emits in this order:
//   slot 0 = vocals, 1 = drums, 2 = bass, 3 = other, 4 = guitar, 5 = piano
// (the 6-source model splits "other" into guitar + piano vs the 4-stem model)
const STEMS_SAVE_NODES = {
  "4": "vocals",
  "5": "drums",
  "6": "bass",
  "7": "other",
  "8": "guitar",
  "9": "piano",
};
export function stemsAvailable() { return !!STEMS_TEMPLATE; }

// ---------------------------------------------------------------------------
// Transcribe (Granite ASR via TTS-Audio-Suite). LoadAudio → engine → ASR →
// PreviewAny capture nodes. We use PreviewAny to push the STRING outputs into
// the prompt's history.outputs map; without it, transient STRING values never
// surface to the /history endpoint. First-run downloads the Granite model
// (~6GB); subsequent runs cache and finish in seconds.
// ---------------------------------------------------------------------------
const TRANSCRIBE_TEMPLATE = loadTemplate("workflow.transcribe.api.json");
const TRANSCRIBE_LOAD_NODE = "1";   // LoadAudio
// ---------------------------------------------------------------------------
// Audio cover (Phase 4) — task_type=cover via the AceStepGenerate custom node.
// Source audio in → re-rendered in the user's chosen style. Lyrics are not
// passed because the diffusers pipeline preserves the source vocals.
// ---------------------------------------------------------------------------
const COVER_AUDIO_TEMPLATE = loadTemplate("workflow.cover.audio.api.json");
const COVER_AUDIO_LOAD_NODE = "1";      // LoadAudio — filename in ComfyUI's input/
const COVER_AUDIO_GEN_NODE  = "2";      // AceStepGenerate
const COVER_AUDIO_SAVE_NODE = "3";      // SaveAudioMP3
export function coverAudioAvailable() { return !!COVER_AUDIO_TEMPLATE; }

// ---------------------------------------------------------------------------
// Extend (Phase 5) — continue an existing clip. Implemented as a repaint
// over a source that's been padded with silence: the audio (and its latent)
// gets extended to the target duration, then task_type=repaint regenerates
// only the silent tail. Caller must measure `sourceDuration` first (via
// ffprobe / track-row lookup) so we know where the splice is.
// ---------------------------------------------------------------------------
const EXTEND_TEMPLATE  = loadTemplate("workflow.extend.api.json");
const EXTEND_LOAD_NODE = "1";       // LoadAudio
const EXTEND_PAD_NODE  = "2";       // EmptyAudio (the silent tail)
const EXTEND_GEN_NODE  = "4";       // AceStepGenerate
const EXTEND_SAVE_NODE = "5";       // SaveAudioMP3
export function extendAvailable() { return !!EXTEND_TEMPLATE; }

export function buildExtendGraph(input) {
  if (!EXTEND_TEMPLATE) return null;
  if (!input.audioInputFile) throw new Error("extend graph requires audioInputFile");
  const srcDur = Number(input.sourceDuration);
  if (!Number.isFinite(srcDur) || srcDur <= 0) {
    throw new Error("extend graph requires positive sourceDuration");
  }
  const extendBy = clamp(Number(input.extendBy) || 30, 5, 240);
  const totalDur = srcDur + extendBy;

  const g = structuredClone(EXTEND_TEMPLATE);
  const seed =
    Number.isInteger(input.seed) && input.seed >= 0
      ? input.seed
      : Math.floor(Math.random() * 2 ** 31);

  g[EXTEND_LOAD_NODE].inputs.audio = String(input.audioInputFile);
  g[EXTEND_PAD_NODE].inputs.duration = extendBy;

  const gen = g[EXTEND_GEN_NODE].inputs;
  gen.audio_duration   = totalDur;
  gen.repainting_start = srcDur;       // splice point — start regenerating here
  gen.repainting_end   = totalDur;     // …through the end of the padded latent
  gen.seed = seed;
  if (input.style != null)  gen.prompt = String(input.style);
  if (input.lyrics != null) gen.lyrics = String(input.lyrics);
  if (input.steps != null)         gen.num_inference_steps = clamp(Number(input.steps), 1, 100);
  if (input.cfgScale != null)      gen.guidance_scale = clamp(Number(input.cfgScale), 0, 20);
  if (input.shift != null)         gen.shift = clamp(Number(input.shift), 1, 7);
  if (input.cfgIntervalStart != null) gen.cfg_interval_start = clamp(Number(input.cfgIntervalStart), 0, 1);
  if (input.cfgIntervalEnd   != null) gen.cfg_interval_end   = clamp(Number(input.cfgIntervalEnd),   0, 1);
  if (input.language != null)      gen.vocal_language = String(input.language);

  const save = g[EXTEND_SAVE_NODE].inputs;
  save.filename_prefix = input.filenamePrefix || "music_app/extend";
  if (input.quality && MP3_QUALITIES.includes(input.quality)) save.quality = input.quality;

  return { graph: g, seed, duration: totalDur };
}

// ---------------------------------------------------------------------------
// Repaint (Phase 6) — regenerate a time window inside an existing clip. The
// source latent is kept outside `[repainting_start, repainting_end]`; only
// the slice between those timestamps is sampled fresh. audio_duration must
// equal the source duration (probed via ffprobe in the route).
// ---------------------------------------------------------------------------
const REPAINT_TEMPLATE  = loadTemplate("workflow.repaint.api.json");
const REPAINT_LOAD_NODE = "1";       // LoadAudio
const REPAINT_GEN_NODE  = "2";       // AceStepGenerate
const REPAINT_SAVE_NODE = "3";       // SaveAudioMP3
export function repaintAvailable() { return !!REPAINT_TEMPLATE; }

export function buildRepaintGraph(input) {
  if (!REPAINT_TEMPLATE) return null;
  if (!input.audioInputFile) throw new Error("repaint graph requires audioInputFile");
  const srcDur = Number(input.sourceDuration);
  if (!Number.isFinite(srcDur) || srcDur <= 0) {
    throw new Error("repaint graph requires positive sourceDuration");
  }
  const start = Math.max(0, Number(input.repaintingStart) || 0);
  let end = Number(input.repaintingEnd);
  // -1 / 0 / missing → "to the end". Clamp end to source duration.
  if (!Number.isFinite(end) || end <= 0 || end > srcDur) end = srcDur;
  if (start >= end) {
    throw new Error(`repaint window is empty: start=${start} end=${end} sourceDuration=${srcDur}`);
  }

  const g = structuredClone(REPAINT_TEMPLATE);
  const seed =
    Number.isInteger(input.seed) && input.seed >= 0
      ? input.seed
      : Math.floor(Math.random() * 2 ** 31);

  g[REPAINT_LOAD_NODE].inputs.audio = String(input.audioInputFile);

  const gen = g[REPAINT_GEN_NODE].inputs;
  gen.audio_duration   = srcDur;
  gen.repainting_start = start;
  gen.repainting_end   = end;
  gen.seed = seed;
  if (input.style != null)  gen.prompt = String(input.style);
  if (input.lyrics != null) gen.lyrics = String(input.lyrics);
  if (input.steps != null)         gen.num_inference_steps = clamp(Number(input.steps), 1, 100);
  if (input.cfgScale != null)      gen.guidance_scale = clamp(Number(input.cfgScale), 0, 20);
  if (input.shift != null)         gen.shift = clamp(Number(input.shift), 1, 7);
  if (input.cfgIntervalStart != null) gen.cfg_interval_start = clamp(Number(input.cfgIntervalStart), 0, 1);
  if (input.cfgIntervalEnd   != null) gen.cfg_interval_end   = clamp(Number(input.cfgIntervalEnd),   0, 1);
  if (input.language != null)      gen.vocal_language = String(input.language);

  const save = g[REPAINT_SAVE_NODE].inputs;
  save.filename_prefix = input.filenamePrefix || "music_app/repaint";
  if (input.quality && MP3_QUALITIES.includes(input.quality)) save.quality = input.quality;

  return { graph: g, seed, duration: srcDur };
}

// ---------------------------------------------------------------------------
// Edit (Phase 7) — change the lyrics while preserving melody/arrangement. We
// use ACE-Step's task_type=lego with track_name="vocals" so the pipeline keeps
// the audio context (instrumental + structure) and regenerates just the named
// track. Defaults to the full source window; caller can narrow with
// repaintingStart/End if they only want to edit a verse.
// ---------------------------------------------------------------------------
const EDIT_TEMPLATE  = loadTemplate("workflow.edit.api.json");
const EDIT_LOAD_NODE = "1";       // LoadAudio
const EDIT_GEN_NODE  = "2";       // AceStepGenerate
const EDIT_SAVE_NODE = "3";       // SaveAudioMP3
export function editAvailable() { return !!EDIT_TEMPLATE; }

export function buildEditGraph(input) {
  if (!EDIT_TEMPLATE) return null;
  if (!input.audioInputFile) throw new Error("edit graph requires audioInputFile");
  if (!input.lyrics)         throw new Error("edit graph requires new lyrics");
  const srcDur = Number(input.sourceDuration);
  if (!Number.isFinite(srcDur) || srcDur <= 0) {
    throw new Error("edit graph requires positive sourceDuration");
  }
  const start = Math.max(0, Number(input.repaintingStart) || 0);
  let end = Number(input.repaintingEnd);
  if (!Number.isFinite(end) || end <= 0 || end > srcDur) end = srcDur;
  if (start >= end) {
    throw new Error(`edit window is empty: start=${start} end=${end} sourceDuration=${srcDur}`);
  }

  const g = structuredClone(EDIT_TEMPLATE);
  const seed =
    Number.isInteger(input.seed) && input.seed >= 0
      ? input.seed
      : Math.floor(Math.random() * 2 ** 31);

  g[EDIT_LOAD_NODE].inputs.audio = String(input.audioInputFile);

  const gen = g[EDIT_GEN_NODE].inputs;
  gen.lyrics           = String(input.lyrics);
  gen.audio_duration   = srcDur;
  gen.repainting_start = start;
  gen.repainting_end   = end;
  gen.seed = seed;
  if (input.style != null)  gen.prompt = String(input.style);
  if (input.trackName)      gen.track_name = String(input.trackName);
  if (input.steps != null)         gen.num_inference_steps = clamp(Number(input.steps), 1, 100);
  if (input.cfgScale != null)      gen.guidance_scale = clamp(Number(input.cfgScale), 0, 20);
  if (input.shift != null)         gen.shift = clamp(Number(input.shift), 1, 7);
  if (input.cfgIntervalStart != null) gen.cfg_interval_start = clamp(Number(input.cfgIntervalStart), 0, 1);
  if (input.cfgIntervalEnd   != null) gen.cfg_interval_end   = clamp(Number(input.cfgIntervalEnd),   0, 1);
  if (input.language != null)      gen.vocal_language = String(input.language);

  const save = g[EDIT_SAVE_NODE].inputs;
  save.filename_prefix = input.filenamePrefix || "music_app/edit";
  if (input.quality && MP3_QUALITIES.includes(input.quality)) save.quality = input.quality;

  return { graph: g, seed, duration: srcDur };
}

export function buildCoverAudioGraph(input) {
  if (!COVER_AUDIO_TEMPLATE) return null;
  if (!input.audioInputFile) throw new Error("cover graph requires audioInputFile");

  const g = structuredClone(COVER_AUDIO_TEMPLATE);
  const seed =
    Number.isInteger(input.seed) && input.seed >= 0
      ? input.seed
      : Math.floor(Math.random() * 2 ** 31);

  g[COVER_AUDIO_LOAD_NODE].inputs.audio = String(input.audioInputFile);

  const gen = g[COVER_AUDIO_GEN_NODE].inputs;
  if (input.style != null)         gen.prompt = String(input.style);
  if (input.lyrics != null)        gen.lyrics = String(input.lyrics); // optional override
  gen.seed = seed;
  if (input.duration != null)      gen.audio_duration = clamp(Number(input.duration), 5, 240);
  if (input.steps != null)         gen.num_inference_steps = clamp(Number(input.steps), 1, 100);
  if (input.cfgScale != null)      gen.guidance_scale = clamp(Number(input.cfgScale), 0, 20);
  if (input.shift != null)         gen.shift = clamp(Number(input.shift), 1, 7);
  if (input.cfgIntervalStart != null) gen.cfg_interval_start = clamp(Number(input.cfgIntervalStart), 0, 1);
  if (input.cfgIntervalEnd   != null) gen.cfg_interval_end   = clamp(Number(input.cfgIntervalEnd),   0, 1);
  if (input.language != null)      gen.vocal_language = String(input.language);
  if (input.audioCoverStrength != null) {
    gen.audio_cover_strength = clamp(Number(input.audioCoverStrength), 0, 1);
  }

  const save = g[COVER_AUDIO_SAVE_NODE].inputs;
  save.filename_prefix = input.filenamePrefix || "music_app/cover";
  if (input.quality && MP3_QUALITIES.includes(input.quality)) save.quality = input.quality;

  return { graph: g, seed };
}

export const TRANSCRIBE_TEXT_NODE   = "4"; // PreviewAny → ASR text
export const TRANSCRIBE_TIMING_NODE = "5"; // PreviewAny → word timing JSON
export const TRANSCRIBE_SRT_NODE    = "7"; // PreviewAny → SRT (timestamped lyrics, used by Phase 2 LRC)
export function transcribeAvailable() { return !!TRANSCRIBE_TEMPLATE; }

export function buildTranscribeGraph(input) {
  if (!TRANSCRIBE_TEMPLATE) return null;
  if (!input.audioInputFile) throw new Error("transcribe graph requires audioInputFile");
  const g = structuredClone(TRANSCRIBE_TEMPLATE);
  g[TRANSCRIBE_LOAD_NODE].inputs.audio = String(input.audioInputFile);
  return { graph: g };
}

export function buildStemsGraph(input) {
  if (!STEMS_TEMPLATE) return null;
  const g = structuredClone(STEMS_TEMPLATE);
  if (!input.audioInputFile) throw new Error("stems graph requires audioInputFile");
  g[STEMS_LOAD_NODE].inputs.audio = String(input.audioInputFile);
  const base = input.filenamePrefix || "music_app/stems";
  for (const [nodeId, stem] of Object.entries(STEMS_SAVE_NODES)) {
    if (g[nodeId]) g[nodeId].inputs.filename_prefix = `${base}_${stem}`;
  }
  return { graph: g, stems: Object.values(STEMS_SAVE_NODES) };
}

// ---------------------------------------------------------------------------
// Cover art (SDXL). Submitted as a separate, much shorter ComfyUI prompt right
// after the audio prompt — they run independently and the cover is done in
// ~5–8s on the 3090, well before the audio finishes.
// ---------------------------------------------------------------------------
const COVER_TEMPLATE = loadTemplate("workflow.cover.api.json");
const COVER_POS_NODE = "2"; // CLIPTextEncode (positive)
const COVER_SAMPLER  = "5"; // KSampler
const COVER_SAVE     = "7"; // SaveImage

export function coverAvailable() { return !!COVER_TEMPLATE; }

// Build a short, image-model-friendly prompt from the track's inputs.
function coverPromptFor(input) {
  const style = (input.style || "").trim();
  // Use the theme if AI-written (cleaner than tagged lyrics); otherwise take
  // the first non-tag, non-empty line of the lyrics as the mood hint.
  let mood = (input.theme || "").trim();
  if (!mood && input.lyrics) {
    const line = String(input.lyrics)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && !s.startsWith("[") && s.toLowerCase() !== "[inst]");
    if (line) mood = line;
  }
  mood = mood.slice(0, 180); // keep CLIP token count sane
  const parts = ["album cover art, square format, professional album cover"];
  if (style) parts.push(style);
  if (mood)  parts.push(`mood: ${mood}`);
  // Don't put "no text" here — CLIP can't process negation and "no text" sometimes
  // CAUSES text. Negative phrasing belongs entirely in the negative prompt (node 3).
  parts.push("high quality, detailed, cinematic lighting");
  return parts.join(", ");
}

export function buildCoverGraph(input) {
  if (!COVER_TEMPLATE) return null;
  const g = structuredClone(COVER_TEMPLATE);
  const seed =
    Number.isInteger(input.coverSeed) && input.coverSeed >= 0
      ? input.coverSeed
      : Math.floor(Math.random() * 2 ** 31);
  g[COVER_POS_NODE].inputs.text = coverPromptFor(input);
  g[COVER_SAMPLER].inputs.seed  = seed;
  g[COVER_SAVE].inputs.filename_prefix = input.coverFilenamePrefix || "music_app/cover";
  return { graph: g, seed, prompt: g[COVER_POS_NODE].inputs.text };
}
