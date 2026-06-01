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

// --- Voice cloning (RVC inside the ComfyUI graph) --------------------------
// Optional second template that adds, after VAEDecodeAudio: stem-separation ->
// RVC voice conversion -> remix -> SaveAudioMP3. Used only when the user picks a
// voice. Configure these via env after you build + export the clone workflow
// (see VOICE_CLONING.md). When unset, cloning is simply unavailable and the app
// behaves exactly as before. The ACE node ids (94/98/3) are assumed identical
// in both templates; only the RVC + final-save nodes are template-specific.
const CLONE_TEMPLATE = loadTemplate(process.env.RVC_CLONE_TEMPLATE || "workflow.clone.api.json");
const RVC_NODE_ID = process.env.RVC_NODE_ID || null;       // id of the RVC inference node
const RVC_MODEL_FIELD = process.env.RVC_MODEL_FIELD || "model"; // its input that selects the .pth
const RVC_SAVE_NODE_ID = process.env.RVC_SAVE_NODE_ID || SAVE_NODE; // final SaveAudioMP3 in the clone graph

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

  g[LATENT_NODE].inputs.seconds = duration;
  g[SAMPLER_NODE].inputs.seed = seed;
  if (input.steps != null) g[SAMPLER_NODE].inputs.steps = clamp(Number(input.steps), 1, 60);

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
