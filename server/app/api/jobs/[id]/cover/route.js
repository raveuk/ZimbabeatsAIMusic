import { db } from "../../../../../lib/db.js";
import { requireUser, json, handler } from "../../../../../lib/api.js";
import { buildCoverGraph, coverAvailable } from "../../../../../lib/workflow.js";
import { submitPrompt } from "../../../../../lib/comfy.js";
import { deleteOutputFile, titleSlug } from "../../../../../lib/files.js";

// Regenerate the cover for an existing track. Deletes the old cover file off
// disk and submits a fresh SDXL prompt with a new seed. The next /api/jobs
// poll will pick up the new cover and the UI swaps it in.
export const POST = handler(async (req, ctx) => {
  const user = requireUser(req);
  if (!coverAvailable()) return json({ error: "cover not configured" }, 500);

  const { id } = await ctx.params;
  const row = db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(Number(id), user.id);
  if (!row) return json({ error: "not found" }, 404);

  if (row.cover_filename) deleteOutputFile(row.cover_subfolder, row.cover_filename);

  const params = JSON.parse(row.params_json);
  const slug = titleSlug(row.title);
  const cover = buildCoverGraph({
    ...params,
    coverFilenamePrefix: `music_app/u${user.id}_t${row.id}${slug ? `_${slug}` : ""}_cover`,
  });
  if (!cover) return json({ error: "cover template missing" }, 500);

  const { prompt_id } = await submitPrompt(cover.graph);
  db.prepare(
    "UPDATE tracks SET cover_prompt_id = ?, cover_filename = NULL, cover_subfolder = NULL WHERE id = ?"
  ).run(prompt_id, row.id);

  return json({ ok: true, coverPromptId: prompt_id });
});
