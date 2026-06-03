// POST /api/training/datasets/save — flushes the lora_datasets row's
// samples_json + settings_json to disk in the ACE-Step training format
// (so convert2hf_dataset.py can consume it). Returns the on-disk path.
import path from "node:path";
import { json, handler, requireUser } from "../../../../../lib/api.js";
import { db } from "../../../../../lib/db.js";
import {
  datasetDir,
  writeDatasetToDisk,
  defaultSettings,
} from "../../../../../lib/training_storage.js";

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const datasetName = String(body.datasetName || body.name || "");
  if (!datasetName) return json({ error: "datasetName required" }, 400);

  // Two callers supported:
  //   (a) `samples` + `settings` passed in directly → trust the body
  //   (b) `datasetId` passed in → load samples_json from the DB row
  let samples = Array.isArray(body.samples) ? body.samples : null;
  let settings = body.settings ? body.settings : null;
  let rowId = null;

  if (!samples && body.datasetId) {
    const row = db.prepare("SELECT * FROM lora_datasets WHERE id = ? AND user_id = ?")
      .get(Number(body.datasetId), user.id);
    if (!row) return json({ error: "dataset not found" }, 404);
    try { samples = JSON.parse(row.samples_json || "[]"); } catch { samples = []; }
    try { settings = settings || JSON.parse(row.settings_json || "{}"); } catch { settings = {}; }
    rowId = row.id;
  }

  if (!samples) {
    // Last resort: pull by (user, name).
    const row = db.prepare("SELECT * FROM lora_datasets WHERE user_id = ? AND name = ?")
      .get(user.id, datasetName);
    if (row) {
      try { samples = JSON.parse(row.samples_json || "[]"); } catch { samples = []; }
      try { settings = settings || JSON.parse(row.settings_json || "{}"); } catch { settings = {}; }
      rowId = row.id;
    }
  }

  if (!Array.isArray(samples) || !samples.length) {
    return json({ error: "no samples to save — upload + build first" }, 400);
  }
  settings = { ...defaultSettings(datasetName), ...(settings || {}) };

  const dir = datasetDir(user.id, datasetName);
  const jsonPath = writeDatasetToDisk(dir, { samples, settings });

  // Update / insert the lora_datasets row so dataset_path matches disk.
  if (rowId) {
    db.prepare("UPDATE lora_datasets SET dataset_path = ?, samples_json = ?, settings_json = ? WHERE id = ?")
      .run(dir, JSON.stringify(samples), JSON.stringify(settings), rowId);
  } else {
    const r = db.prepare(
      "INSERT INTO lora_datasets (user_id, name, samples_json, settings_json, dataset_path) VALUES (?, ?, ?, ?, ?)"
    ).run(user.id, datasetName, JSON.stringify(samples), JSON.stringify(settings), dir);
    rowId = Number(r.lastInsertRowid);
  }

  return json({
    ok: true,
    datasetId: rowId,
    datasetPath: jsonPath,
    sampleCount: samples.length,
    status: `Saved ${samples.length} samples to ${path.basename(dir)}/dataset.json`,
  });
});
