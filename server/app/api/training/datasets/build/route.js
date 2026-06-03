// POST /api/training/datasets/build — after /upload has written files to
// disk, this endpoint inspects the per-user dataset directory and creates
// (or refreshes) the lora_datasets row. Returns the full sample list +
// dataframe + first-sample preview that the Training table expects.
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../../lib/api.js";
import { db } from "../../../../../lib/db.js";
import {
  datasetDir,
  defaultSampleForFile,
  defaultSettings,
  buildDataframe,
} from "../../../../../lib/training_storage.js";

const AUDIO_RE = /\.(mp3|wav|flac|ogg|opus|m4a)$/i;

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const datasetName = String(body.datasetName || "my_lora_dataset");
  const dir = datasetDir(user.id, datasetName);

  // Walk the per-dataset dir for audio files we just wrote in /upload.
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch {}
  const audioFiles = entries.filter((f) => AUDIO_RE.test(f)).sort();
  if (!audioFiles.length) {
    return json({ error: "no audio files found in dataset directory — upload first" }, 400);
  }

  // Build initial samples — one per audio. tags get a starter value if the
  // user picked a customTag in the settings.
  const settings = {
    ...defaultSettings(datasetName),
    customTag: body.customTag || "",
    tagPosition: body.tagPosition || "append",
    allInstrumental: !!body.allInstrumental,
  };
  const samples = audioFiles.map((f) => {
    const s = defaultSampleForFile(f);
    if (settings.allInstrumental) s.instrumental = true;
    if (settings.customTag) s.tags = settings.customTag;
    return s;
  });

  // Upsert the lora_datasets row.
  const existing = db.prepare("SELECT id FROM lora_datasets WHERE user_id = ? AND name = ?")
    .get(user.id, datasetName);
  const samplesJson = JSON.stringify(samples);
  const settingsJson = JSON.stringify(settings);
  let dsId;
  if (existing) {
    db.prepare(
      "UPDATE lora_datasets SET samples_json = ?, settings_json = ?, dataset_path = ? WHERE id = ?"
    ).run(samplesJson, settingsJson, dir, existing.id);
    dsId = existing.id;
  } else {
    const r = db.prepare(
      "INSERT INTO lora_datasets (user_id, name, samples_json, settings_json, dataset_path) VALUES (?, ?, ?, ?, ?)"
    ).run(user.id, datasetName, samplesJson, settingsJson, dir);
    dsId = Number(r.lastInsertRowid);
  }

  return json({
    datasetId: dsId,
    sampleCount: samples.length,
    sample: samples[0] || null,
    settings,
    dataframe: buildDataframe(samples),
    datasetPath: path.join(dir, "dataset.json"),
    status: `Loaded ${samples.length} audio file${samples.length === 1 ? "" : "s"} from ${path.basename(dir)}.`,
  });
});
