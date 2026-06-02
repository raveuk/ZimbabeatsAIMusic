// GET /api/lrc/[trackId] — return a karaoke LRC for the user's finished
// track. First call runs ASR (via the Phase 1 Granite chain, which now
// also emits an SRT side-channel via TextToSRTBuilderNode); subsequent
// calls stream the cached .lrc from disk.
//
// Path: output/music_app/u{userId}_t{trackId}.lrc, recorded on
// tracks.lrc_path so the player can know whether one exists.
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../lib/api.js";
import { db } from "../../../../lib/db.js";
import { stageBuffer } from "../../../../lib/uploads.js";
import { srtToLrc } from "../../../../lib/lrc.js";
import {
  buildTranscribeGraph,
  transcribeAvailable,
  TRANSCRIBE_SRT_NODE,
} from "../../../../lib/workflow.js";
import { submitPrompt, getHistory } from "../../../../lib/comfy.js";

const COMFYUI_ROOT = process.env.COMFYUI_ROOT || "/home/raveuk/comfy/ComfyUI";
const OUTPUT_DIR = path.join(COMFYUI_ROOT, "output", "music_app");
const POLL_DEADLINE_MS = 12 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

export const GET = handler(async (req, ctx) => {
  const user = await requireUser(req);
  if (!transcribeAvailable()) return json({ error: "transcribe workflow not configured" }, 500);

  const { trackId } = await ctx.params;
  const row = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(Number(trackId), user.id);
  if (!row) return json({ error: "track not found" }, 404);
  if (row.status !== "done" || !row.filename) return json({ error: "track not finished" }, 400);

  // Cache hit: previously generated LRC sitting on disk.
  if (row.lrc_path) {
    const cached = path.join(OUTPUT_DIR, row.lrc_path);
    if (fs.existsSync(cached)) {
      return new Response(fs.readFileSync(cached), {
        status: 200,
        headers: {
          "content-type": "application/x-subrip; charset=utf-8",
          "content-disposition": `attachment; filename="${path.basename(cached)}"`,
        },
      });
    }
  }

  // Cache miss — stage the track audio, run Granite ASR (with SRT side-
  // channel), convert SRT→LRC, write to disk, update the row.
  const srcPath = path.join(OUTPUT_DIR, row.filename);
  if (!fs.existsSync(srcPath)) return json({ error: "audio file missing on disk" }, 410);
  const buf = fs.readFileSync(srcPath);
  let staged;
  try {
    staged = stageBuffer({
      buf, userId: user.id, originalName: row.title || row.filename,
      mime: "audio/mpeg", source: "track", trackId: row.id,
    });
  } catch (e) {
    return json({ error: e.message || "stage failed" }, e.status || 500);
  }

  const built = buildTranscribeGraph({ audioInputFile: staged.filename });
  let promptId;
  try {
    const r = await submitPrompt(built.graph);
    promptId = r.prompt_id;
  } catch (e) {
    return json({ error: "ComfyUI rejected the LRC prompt", detail: e.detail ?? String(e) }, 502);
  }

  const deadline = Date.now() + POLL_DEADLINE_MS;
  let entry = null;
  while (Date.now() < deadline) {
    entry = await getHistory(promptId);
    const s = entry?.status?.status_str;
    if (s === "success" || s === "error") break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  if (entry?.status?.status_str !== "success") {
    return json({ error: "transcription failed", detail: entry?.status?.messages || null }, 502);
  }

  const srt = entry.outputs?.[TRANSCRIBE_SRT_NODE]?.text?.[0] || "";
  const lrc = srtToLrc(srt, { title: row.title || `Track ${row.id}`, artist: null });

  const lrcName = `u${user.id}_t${row.id}.lrc`;
  const lrcPath = path.join(OUTPUT_DIR, lrcName);
  fs.writeFileSync(lrcPath, lrc, "utf8");
  db.prepare("UPDATE tracks SET lrc_path = ? WHERE id = ?").run(lrcName, row.id);

  return new Response(lrc, {
    status: 200,
    headers: {
      "content-type": "application/x-subrip; charset=utf-8",
      "content-disposition": `attachment; filename="${lrcName}"`,
    },
  });
});
