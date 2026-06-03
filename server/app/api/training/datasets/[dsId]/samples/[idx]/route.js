// GET  /api/training/datasets/[dsId]/samples/[idx] — read one sample
// PATCH /api/training/datasets/[dsId]/samples/[idx] — edit one sample
//
// The dataset's samples_json is updated atomically — re-deserialise, mutate
// the targeted index, re-serialise. The on-disk dataset.json is NOT touched
// here; only /api/training/datasets/save flushes to disk.
import { json, handler, requireUser } from "../../../../../../../lib/api.js";
import { db } from "../../../../../../../lib/db.js";
import { buildDataframe } from "../../../../../../../lib/training_storage.js";

function loadOwnedDataset(dsId, userId) {
  const row = db.prepare("SELECT * FROM lora_datasets WHERE id = ? AND user_id = ?").get(dsId, userId);
  if (!row) return null;
  let samples = [];
  try { samples = JSON.parse(row.samples_json || "[]"); } catch {}
  let settings = {};
  try { settings = JSON.parse(row.settings_json || "{}"); } catch {}
  return { row, samples, settings };
}

export const GET = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { dsId, idx } = await ctx.params;
  const ds = loadOwnedDataset(Number(dsId), user.id);
  if (!ds) return json({ error: "dataset not found" }, 404);
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= ds.samples.length) {
    return json({ error: "sample index out of range" }, 404);
  }
  return json({ sample: ds.samples[i], datasetId: ds.row.id, idx: i, total: ds.samples.length });
});

export const PATCH = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { dsId, idx } = await ctx.params;
  const ds = loadOwnedDataset(Number(dsId), user.id);
  if (!ds) return json({ error: "dataset not found" }, 404);
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= ds.samples.length) {
    return json({ error: "sample index out of range" }, 404);
  }
  const body = await req.json().catch(() => ({}));
  // Whitelisted fields the UI's sample edit form sends.
  const editable = [
    "caption", "genre", "promptOverride", "tags", "lyrics", "rawLyrics",
    "bpm", "key", "timeSignature", "duration", "language", "instrumental",
  ];
  const patched = { ...ds.samples[i] };
  for (const k of editable) {
    if (body[k] !== undefined) patched[k] = body[k];
  }
  ds.samples[i] = patched;
  db.prepare("UPDATE lora_datasets SET samples_json = ? WHERE id = ?")
    .run(JSON.stringify(ds.samples), ds.row.id);
  return json({
    ok: true,
    sample: patched,
    dataframe: buildDataframe(ds.samples),
    status: `Saved sample ${i + 1}/${ds.samples.length}`,
  });
});
