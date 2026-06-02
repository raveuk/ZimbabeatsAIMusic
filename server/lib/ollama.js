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
