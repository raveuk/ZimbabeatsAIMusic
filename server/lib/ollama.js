// Generate lyrics by calling Ollama's HTTP API directly (no ComfyUI node).
// We read only the `response` text, so this works with ANY model — including
// `:cloud` models, which omit the `context` field the comfyui-ollama node trips on.
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:q4_K_M";
const LYRICS_SYSTEM =
  "You are a professional songwriter. Output ONLY song lyrics with [verse], [chorus], [bridge] section tags. No title, no commentary.";

// Friendly names so we can tell Ollama plainly ("Write in French.") instead of
// passing it an ISO code. Mirrors mobile/lib/labels.js — keep them in sync.
const LANGUAGE_NAMES = {
  ar: "Arabic", az: "Azerbaijani", bg: "Bulgarian", bn: "Bengali", ca: "Catalan",
  cs: "Czech", da: "Danish", de: "German", el: "Greek", en: "English",
  es: "Spanish", fa: "Persian", fi: "Finnish", fr: "French", he: "Hebrew",
  hi: "Hindi", hr: "Croatian", ht: "Haitian Creole", hu: "Hungarian", id: "Indonesian",
  is: "Icelandic", it: "Italian", ja: "Japanese", ko: "Korean", la: "Latin",
  lt: "Lithuanian", ms: "Malay", ne: "Nepali", nl: "Dutch", no: "Norwegian",
  pa: "Punjabi", pl: "Polish", pt: "Portuguese", ro: "Romanian", ru: "Russian",
  sa: "Sanskrit", sk: "Slovak", sr: "Serbian", sv: "Swedish", sw: "Swahili",
  ta: "Tamil", te: "Telugu", th: "Thai", tl: "Tagalog", tr: "Turkish",
  uk: "Ukrainian", ur: "Urdu", vi: "Vietnamese", yue: "Cantonese", zh: "Chinese",
};

// "Thinking" mode (Chain-of-Thought): when on, we prepend an instruction
// telling the model to plan genre / mood / story arc first, then emit ONLY
// the final lyrics. The system prompt's "Output ONLY song lyrics" guardrail
// already enforces that the visible response is just the lyrics — the
// planning happens in the model's internal generation but the post-system
// constraint clips the output to the lyrics block.
const CoT_PREAMBLE = "Before writing, briefly plan the song's genre, mood, story arc, and verse/chorus structure. Then write ONLY the finished lyrics with [verse]/[chorus]/[bridge] tags — do not include your planning notes.\n\n";

function buildPrompt(theme, language, thinking) {
  const langName = LANGUAGE_NAMES[language];
  const langInstr = langName && language !== "en"
    ? `Write the entire song in ${langName}. Use ${langName} grammar, vocabulary and idioms — do NOT mix in English.\n\n`
    : "";
  const cot = thinking ? CoT_PREAMBLE : "";
  return `${cot}${langInstr}Theme: ${String(theme)}`;
}

export async function generateLyrics(theme, language, opts = {}) {
  const prompt = buildPrompt(theme, language, !!opts.thinking);

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, system: LYRICS_SYSTEM, prompt, stream: false, keep_alive: "30m" }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data.response || "").trim();
  if (!text) throw new Error("Ollama returned empty lyrics");
  return text;
}

// Auto-label helpers for the LoRA training pipeline (Task #19). Given a
// sample's existing fields (filename, transcribed lyrics) we ask Ollama for
// a compact JSON describing the music — tags, genre, bpm, key, language,
// instrumental, plus optionally re-formatted lyrics with [verse]/[chorus]
// tags. Errors bubble up so the caller can fall back to the un-labeled row.
const AUTOLABEL_SYSTEM =
  "You annotate music training samples. Reply ONLY with valid JSON — no commentary, no code fence.";

const AUTOLABEL_FIELDS_DOC = `Return JSON with these keys:
{
  "tags": "comma-separated style tags (genre, mood, instruments, era)",
  "genre": "single genre word",
  "bpm": <integer 40-220 or 0 if unknown>,
  "key": "<key string like 'C major' or '' if unknown>",
  "language": "<ISO 639-1 language code like 'en' if vocal, '' if instrumental>",
  "instrumental": <true if no vocals else false>
}`;

export async function autoLabelSample({ filename, lyrics }) {
  const lyricsBlock = lyrics ? `\n\nLyrics:\n${String(lyrics).slice(0, 1500)}` : "";
  const prompt = `Filename: ${filename}${lyricsBlock}\n\n${AUTOLABEL_FIELDS_DOC}\n\nRespond with JSON only.`;
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL, system: AUTOLABEL_SYSTEM, prompt,
      stream: false, format: "json", keep_alive: "30m",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data.response || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Ollama auto-label returned non-JSON: ${text.slice(0, 120)}`);
  }
}

// Take raw ASR output and re-section it as [verse]/[chorus]/[bridge] for
// ACE-Step training. Cheap shaping pass — the user can always edit manually.
export async function formatLyricsForTraining(rawLyrics) {
  const prompt = `Re-format the following lyrics with [verse], [chorus] and [bridge] section tags. Keep the original words; only add structure tags and line breaks. Output ONLY the lyrics, no commentary.\n\n${String(rawLyrics).slice(0, 4000)}`;
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      system: "You re-format song lyrics with section tags. Output ONLY the lyrics.",
      prompt, stream: false, keep_alive: "30m",
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return (data.response || "").trim();
}

// Same as generateLyrics, but returns Ollama's NDJSON stream directly so the
// caller can pipe it through to the browser. Each line is a JSON object like
// `{"response":"<chunk>", "done":false}` — last line has done=true. Caller
// owns the resulting ReadableStream + must handle/close it.
export async function streamLyrics(theme, language, opts = {}) {
  const prompt = buildPrompt(theme, language, !!opts.thinking);

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, system: LYRICS_SYSTEM, prompt, stream: true, keep_alive: "30m" }),
  });
  if (!res.ok || !res.body) {
    const detail = res.ok ? "no body" : await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${String(detail).slice(0, 200)}`);
  }
  return res.body;
}
