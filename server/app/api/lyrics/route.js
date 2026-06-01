import { requireUser, json, handler } from "../../../lib/api.js";
import { generateLyrics } from "../../../lib/ollama.js";

// Preview lyrics from a theme WITHOUT creating a track or touching the GPU.
// Lets the app show (and let the user edit) the lyrics before generating music.
export const POST = handler(async (req) => {
  requireUser(req);
  const { theme, language } = await req.json();
  console.log(`[lyrics] theme="${String(theme || "").slice(0, 40)}" language=${JSON.stringify(language)}`);
  if (!theme || !String(theme).trim()) return json({ error: "enter a theme first" }, 400);
  try {
    const lyrics = await generateLyrics(theme, language);
    return json({ lyrics });
  } catch (e) {
    return json({ error: "lyric generation failed", detail: String(e.message || e) }, 502);
  }
});
