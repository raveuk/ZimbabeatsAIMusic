import { requireUser, json, handler } from "../../../lib/api.js";
import { generateLyrics, streamLyrics } from "../../../lib/ollama.js";

// Preview lyrics from a theme WITHOUT creating a track or touching the GPU.
// Lets the app show (and let the user edit) the lyrics before generating music.
//
// Two response modes:
//   - default (?stream=0 or absent): wait for full text, return { lyrics }
//   - ?stream=1: pipe Ollama's NDJSON chunks straight through to the client
//     so the UI can render the text as it's being generated. Caller reads
//     the response.body line-by-line; each line is JSON with a `response`
//     field containing the next chunk of text (and `done:true` on the last).
export const POST = handler(async (req) => {
  await requireUser(req);
  const url = new URL(req.url);
  const wantsStream = url.searchParams.get("stream") === "1";
  const { theme, language, thinking } = await req.json();
  console.log(`[lyrics] theme="${String(theme || "").slice(0, 40)}" language=${JSON.stringify(language)} stream=${wantsStream} thinking=${!!thinking}`);
  if (!theme || !String(theme).trim()) return json({ error: "enter a theme first" }, 400);

  if (wantsStream) {
    try {
      const body = await streamLyrics(theme, language, { thinking: !!thinking });
      // text/plain so the browser doesn't try to parse the partial NDJSON as
      // JSON. Disable buffering so chunks arrive promptly through CF Tunnel.
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/x-ndjson; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          "x-accel-buffering": "no",
        },
      });
    } catch (e) {
      return json({ error: "lyric generation failed", detail: String(e.message || e) }, 502);
    }
  }

  try {
    const lyrics = await generateLyrics(theme, language, { thinking: !!thinking });
    return json({ lyrics });
  } catch (e) {
    return json({ error: "lyric generation failed", detail: String(e.message || e) }, 502);
  }
});
