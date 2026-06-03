// PUT /api/training/datasets/[dsId]/settings — update the dataset-wide
// settings (customTag, tagPosition, allInstrumental, genreRatio, …). The
// UI's handleUpdateSettings calls this when the user tweaks the global
// caption controls.
import { json, handler, requireUser } from "../../../../../../lib/api.js";
import { db } from "../../../../../../lib/db.js";
import { defaultSettings } from "../../../../../../lib/training_storage.js";

export const PUT = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { dsId } = await ctx.params;
  const row = db.prepare("SELECT * FROM lora_datasets WHERE id = ? AND user_id = ?")
    .get(Number(dsId), user.id);
  if (!row) return json({ error: "dataset not found" }, 404);

  const body = await req.json().catch(() => ({}));
  let current = {};
  try { current = JSON.parse(row.settings_json || "{}"); } catch {}
  // Merge into the existing settings; unknown keys are kept (so future UI
  // additions don't get silently dropped).
  const merged = { ...defaultSettings(row.name), ...current, ...body };
  db.prepare("UPDATE lora_datasets SET settings_json = ? WHERE id = ?")
    .run(JSON.stringify(merged), row.id);
  return json({ ok: true, settings: merged });
});
