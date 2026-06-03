// POST /api/training/datasets/import — multipart upload of a dataset JSON
// file (the same shape `Save Dataset` writes — { samples, settings }).
// Validates + stores under the per-user datasets root + inserts a row so
// the Training panel can load it like any home-grown dataset.
//
// Body: multipart with `file` (.json) and `datasetName` (string).
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../../lib/api.js";
import { db } from "../../../../../lib/db.js";
import { datasetDir, defaultSettings, buildDataframe } from "../../../../../lib/training_storage.js";

const MAX_JSON_BYTES = 8 * 1024 * 1024; // 8 MB — plenty for a sample list

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const form = await req.formData();
  const file = form.get("file");
  const datasetName = String(form.get("datasetName") || "").trim() || "imported_dataset";
  if (!file || typeof file === "string") return json({ error: "missing file" }, 400);

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return json({ error: "empty file" }, 400);
  if (buf.length > MAX_JSON_BYTES) {
    return json({ error: `file too large (max ${MAX_JSON_BYTES / 1024 / 1024} MB)` }, 413);
  }

  let parsed;
  try { parsed = JSON.parse(buf.toString("utf8")); }
  catch (e) { return json({ error: "file is not valid JSON" }, 400); }

  // Two shapes accepted:
  //  - { samples: [...], settings: {...} }    ← our canonical Save Dataset output
  //  - [ ... ]                                ← bare array of samples
  let samples, settings;
  if (Array.isArray(parsed)) {
    samples = parsed;
    settings = defaultSettings(datasetName);
  } else if (parsed && typeof parsed === "object") {
    samples = Array.isArray(parsed.samples) ? parsed.samples : [];
    settings = { ...defaultSettings(datasetName), ...(parsed.settings || {}) };
  } else {
    return json({ error: "JSON must be an object with `samples` or a sample array" }, 400);
  }
  if (!samples.length) return json({ error: "samples array is empty" }, 400);

  // Light validation — at minimum every sample needs a filename.
  for (const s of samples) {
    if (!s || typeof s !== "object" || !s.filename) {
      return json({ error: "every sample needs a `filename` string" }, 400);
    }
  }

  // Drop the JSON into the per-user dataset dir so subsequent Load Dataset
  // finds it. We don't copy the audio — caller must upload / scan those.
  const dir = datasetDir(user.id, datasetName);
  fs.writeFileSync(path.join(dir, "dataset.json"), JSON.stringify({ samples, settings }, null, 2), "utf8");

  // Upsert the lora_datasets row.
  const existing = db.prepare("SELECT id FROM lora_datasets WHERE user_id = ? AND name = ?")
    .get(user.id, datasetName);
  let dsId;
  if (existing) {
    db.prepare("UPDATE lora_datasets SET samples_json = ?, settings_json = ?, dataset_path = ? WHERE id = ?")
      .run(JSON.stringify(samples), JSON.stringify(settings), dir, existing.id);
    dsId = existing.id;
  } else {
    const r = db.prepare(
      "INSERT INTO lora_datasets (user_id, name, samples_json, settings_json, dataset_path) VALUES (?, ?, ?, ?, ?)"
    ).run(user.id, datasetName, JSON.stringify(samples), JSON.stringify(settings), dir);
    dsId = Number(r.lastInsertRowid);
  }

  // Warn if the referenced audio files aren't actually on disk under this
  // dataset dir — the UI can surface this to prompt the user to upload them.
  let audioPresent = 0;
  let audioMissing = 0;
  for (const s of samples) {
    const fp = path.isAbsolute(s.filename) ? s.filename : path.join(dir, s.filename);
    if (fs.existsSync(fp)) audioPresent += 1; else audioMissing += 1;
  }

  return json({
    ok: true,
    datasetId: dsId,
    sampleCount: samples.length,
    sample: samples[0],
    settings,
    dataframe: buildDataframe(samples),
    datasetPath: path.join(dir, "dataset.json"),
    audioPresent,
    audioMissing,
    status: `Imported ${samples.length} samples (${audioPresent} audio present, ${audioMissing} missing)`,
  });
});
