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

export async function generateLyrics(theme, language) {
  // Build the user prompt; tack a hard language instruction on the front when
  // the caller passed one and it isn't English (the model defaults to English).
  const langName = LANGUAGE_NAMES[language];
  const prompt = langName && language !== "en"
    ? `Write the entire song in ${langName}. Use ${langName} grammar, vocabulary and idioms — do NOT mix in English.\n\nTheme: ${String(theme)}`
    : String(theme);

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, system: LYRICS_SYSTEM, prompt, stream: false }),
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
