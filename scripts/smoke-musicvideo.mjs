// Smoke test: build the music-video graph and submit it to ComfyUI directly.
// Polls /history for completion + collects the output filename.
import { buildMusicVideoGraph } from "../server/lib/workflow.js";
import { submitPrompt } from "../server/lib/comfy.js";

const COMFY = process.env.COMFY_URL || "http://127.0.0.1:8188";

const built = buildMusicVideoGraph({
  audioInputFile: "smoke_mv_audio.mp3",
  imageInputFile: "example.png",
  positivePrompt: "cinematic music video, soft golden hour lighting, emotive performance",
  width: 512, height: 512,
  lengthFrames: 33,  // ~2 s @ 16 fps — small clip for smoke speed
  fps: 16,
  filenamePrefix: "music_app/smoke_musicvideo",
});
if (!built) { console.error("graph not available"); process.exit(2); }

console.log("submitting…");
let promptId;
try {
  const r = await submitPrompt(built.graph);
  promptId = r.prompt_id;
} catch (e) {
  console.error("submit failed:", e?.detail ?? e?.message ?? e);
  process.exit(3);
}
console.log("prompt_id:", promptId);

let lastNote = "";
const t0 = Date.now();
while (true) {
  await new Promise((r) => setTimeout(r, 4000));
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const res = await fetch(`${COMFY}/history/${promptId}`).then((r) => r.json());
  const entry = res[promptId];
  if (!entry) { if (lastNote !== "queued") { lastNote = "queued"; console.log(`[${elapsed}s] queued…`); } continue; }
  const status = entry.status?.status_str;
  if (status === "success") {
    const outs = Object.values(entry.outputs || {});
    const vids = outs.flatMap((o) => o.videos || o.gifs || []);
    console.log(`[${elapsed}s] DONE — videos:`, vids);
    process.exit(0);
  }
  if (status === "error") {
    console.error(`[${elapsed}s] ERROR`, JSON.stringify(entry.status, null, 2));
    process.exit(1);
  }
  if (lastNote !== "running") { lastNote = "running"; console.log(`[${elapsed}s] running…`); }
  if (elapsed > 900) { console.error("timeout"); process.exit(4); }
}
