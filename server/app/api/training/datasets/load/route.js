// POST /api/training/datasets/load — load a dataset from disk back into the
// UI. Accepts either:
//   { datasetPath: "./datasets/foo/dataset.json" } — a relative-to-user path
//   { datasetId: 42 } — the SQL id (then hydrate from the row)
//   { datasetName: "foo" }    — by name owned by the user
// All three converge on a unified response the UI's handleLoadDataset reads.
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../../lib/api.js";
import { db } from "../../../../../lib/db.js";
import {
  datasetDir,
  readDatasetFromDisk,
  buildDataframe,
  defaultSettings,
} from "../../../../../lib/training_storage.js";
import { safePathUnderDatasetsRoot } from "../../../../../lib/training.js";

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));

  let dir = null;
  let datasetName = body.datasetName || null;
  let rowId = body.datasetId ? Number(body.datasetId) : null;

  if (body.datasetPath) {
    // Resolve relative to per-user root; reject path escapes.
    const rel = String(body.datasetPath).replace(/^\.\//, "");
    const safe = safePathUnderDatasetsRoot(user.id, rel);
    // `safe` may be a dataset.json file OR a directory containing it.
    dir = fs.statSync(safe).isDirectory() ? safe : path.dirname(safe);
    datasetName = datasetName || path.basename(dir);
  } else if (rowId) {
    const row = db.prepare("SELECT * FROM lora_datasets WHERE id = ? AND user_id = ?").get(rowId, user.id);
    if (!row) return json({ error: "dataset not found" }, 404);
    dir = row.dataset_path || datasetDir(user.id, row.name);
    datasetName = row.name;
  } else if (datasetName) {
    dir = datasetDir(user.id, datasetName);
  } else {
    return json({ error: "datasetPath, datasetId, or datasetName required" }, 400);
  }

  if (!fs.existsSync(dir)) return json({ error: `dataset directory missing: ${dir}` }, 404);

  const { samples, settings } = readDatasetFromDisk(dir);
  const finalSettings = { ...defaultSettings(datasetName), ...settings };

  // Upsert the row so subsequent edits / save flow find it.
  const existing = db.prepare("SELECT id FROM lora_datasets WHERE user_id = ? AND name = ?")
    .get(user.id, datasetName);
  let dsId;
  if (existing) {
    db.prepare("UPDATE lora_datasets SET samples_json = ?, settings_json = ?, dataset_path = ? WHERE id = ?")
      .run(JSON.stringify(samples), JSON.stringify(finalSettings), dir, existing.id);
    dsId = existing.id;
  } else {
    const r = db.prepare(
      "INSERT INTO lora_datasets (user_id, name, samples_json, settings_json, dataset_path) VALUES (?, ?, ?, ?, ?)"
    ).run(user.id, datasetName, JSON.stringify(samples), JSON.stringify(finalSettings), dir);
    dsId = Number(r.lastInsertRowid);
  }

  return json({
    datasetId: dsId,
    sampleCount: samples.length,
    sample: samples[0] || null,
    settings: finalSettings,
    dataframe: buildDataframe(samples),
    datasetPath: dir,
    status: `Loaded ${samples.length} samples from ${path.basename(dir)}`,
  });
});
