import fs from "node:fs";
import path from "node:path";
import { db } from "../../../../../lib/db.js";
import { requireUser, json, handler } from "../../../../../lib/api.js";
import { buildStemsGraph, stemsAvailable } from "../../../../../lib/workflow.js";
import { submitPrompt, getHistory } from "../../../../../lib/comfy.js";
import { titleSlug } from "../../../../../lib/files.js";

// Output dir for the source mp3 lives here; ComfyUI's input dir is here too.
const COMFYUI_ROOT = process.env.COMFYUI_ROOT || "/home/raveuk/comfy/ComfyUI";
const OUTPUT_DIR = path.join(COMFYUI_ROOT, "output", "music_app");
const INPUT_DIR  = path.join(COMFYUI_ROOT, "input");

// Run htdemucs on a finished track. Returns the stem filenames once Demucs
// finishes (typically ~30–60s for a 30s track on a 3090). LoadAudio reads
// from ComfyUI's input/ folder, so we copy the source mp3 in first, then
// clean up the copy after the workflow completes.
export const POST = handler(async (req, ctx) => {
  const user = await requireUser(req);
  if (!stemsAvailable()) return json({ error: "stems workflow missing" }, 500);

  const { id } = await ctx.params;
  const row = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(Number(id), user.id);
  if (!row) return json({ error: "not found" }, 404);
  if (row.status !== "done" || !row.filename) return json({ error: "track not finished" }, 400);

  const srcPath = path.join(OUTPUT_DIR, row.filename);
  if (!fs.existsSync(srcPath)) return json({ error: "audio file missing on disk" }, 410);

  // Stable input filename so re-runs replace cleanly + don't pollute input/
  const inputName = `stems_input_t${row.id}.mp3`;
  const inputPath = path.join(INPUT_DIR, inputName);
  try { fs.copyFileSync(srcPath, inputPath); }
  catch (e) { return json({ error: "could not stage input", detail: String(e.message || e) }, 500); }

  const slug = titleSlug(row.title);
  const built = buildStemsGraph({
    audioInputFile: inputName,
    filenamePrefix: `music_app/u${user.id}_t${row.id}${slug ? `_${slug}` : ""}_stems`,
  });
  if (!built) return json({ error: "could not build stems graph" }, 500);

  let promptId;
  try {
    const r = await submitPrompt(built.graph);
    promptId = r.prompt_id;
  } catch (e) {
    try { fs.unlinkSync(inputPath); } catch {}
    return json({ error: "ComfyUI rejected the stems prompt", detail: e.detail ?? String(e) }, 502);
  }

  // Poll history every 2s until done. Cap at ~5 minutes.
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const entry = await getHistory(promptId);
    const status = entry?.status?.status_str;
    if (status === "success" || status === "error") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  // Always remove our staged input copy — even on failure.
  try { fs.unlinkSync(inputPath); } catch {}

  const entry = await getHistory(promptId);
  if (entry?.status?.status_str !== "success") {
    return json({ error: "stem separation failed", detail: entry?.status?.messages || null }, 502);
  }

  // Pull each save node's output and pack into a clean response.
  const stems = {};
  for (const [nodeId, name] of Object.entries({ "4": "vocals", "5": "bass", "6": "drums", "7": "other" })) {
    const out = entry.outputs?.[nodeId];
    const filename = out?.audio?.[0]?.filename;
    if (filename) stems[name] = `/api/stems/${row.id}/${name}`;
  }

  return json({ ok: true, promptId, stems });
});
