// POST /api/transcribe — accept { uploadId }, run the Granite ASR workflow
// against the staged audio file, return { text, segments }. The Transform
// panel's "Transcribe" button hits this; Phase 2 (LRC export) re-uses the
// same path with the word-timing segments to build a karaoke .lrc.
//
// First call after a server reboot downloads the ~6GB Granite model and
// can take several minutes. Subsequent calls finish in 5–10s for a 60s
// track on the 3090.
import path from "node:path";
import fs from "node:fs";
import { json, handler, requireUser } from "../../../lib/api.js";
import {
  buildTranscribeGraph,
  transcribeAvailable,
  TRANSCRIBE_TEXT_NODE,
  TRANSCRIBE_TIMING_NODE,
} from "../../../lib/workflow.js";
import { submitPrompt, getHistory } from "../../../lib/comfy.js";
import { getUploadForUser } from "../../../lib/uploads.js";

const COMFYUI_ROOT = process.env.COMFYUI_ROOT || "/home/raveuk/comfy/ComfyUI";
const INPUT_DIR = path.join(COMFYUI_ROOT, "input");

// 12 minute cap — Granite first-run model download is the worst case; a
// cached run on a 60s track is under 10s.
const POLL_DEADLINE_MS = 12 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  if (!transcribeAvailable()) return json({ error: "transcribe workflow not configured" }, 500);

  const body = await req.json().catch(() => ({}));
  const uploadId = Number(body?.uploadId);
  if (!Number.isInteger(uploadId) || uploadId <= 0) return json({ error: "uploadId required" }, 400);

  const upload = getUploadForUser(uploadId, user.id);
  if (!upload) return json({ error: "upload not found" }, 404);
  // Confirm the staged file still exists — TTL sweep might have removed it.
  if (!fs.existsSync(path.join(INPUT_DIR, upload.filename))) {
    return json({ error: "staged file missing — re-upload" }, 410);
  }

  const built = buildTranscribeGraph({ audioInputFile: upload.filename });
  if (!built) return json({ error: "could not build transcribe graph" }, 500);

  let promptId;
  try {
    const r = await submitPrompt(built.graph);
    promptId = r.prompt_id;
  } catch (e) {
    return json({ error: "ComfyUI rejected the transcribe prompt", detail: e.detail ?? String(e) }, 502);
  }

  // Poll history until success/error or deadline.
  const deadline = Date.now() + POLL_DEADLINE_MS;
  let entry = null;
  while (Date.now() < deadline) {
    entry = await getHistory(promptId);
    const s = entry?.status?.status_str;
    if (s === "success" || s === "error") break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (entry?.status?.status_str !== "success") {
    return json({
      error: "transcription failed",
      detail: entry?.status?.messages || null,
    }, 502);
  }

  // PreviewAny pushes its input string into outputs[node].text[0] via the
  // `ui: { text: (value,) }` return. See comfy_extras/nodes_preview_any.py.
  const outputs = entry.outputs || {};
  const text = outputs[TRANSCRIBE_TEXT_NODE]?.text?.[0] || "";
  const timingRaw = outputs[TRANSCRIBE_TIMING_NODE]?.text?.[0] || "";

  // Word-timing data comes back as a JSON string; try to parse, but never
  // hard-fail the request if the format isn't what we expected — the user
  // mostly cares about the lyric text.
  let segments = null;
  try { segments = timingRaw ? JSON.parse(timingRaw) : null; }
  catch { segments = null; }

  return json({ text, segments, promptId });
});
