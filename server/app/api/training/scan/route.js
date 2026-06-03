// POST /api/training/scan — scans a directory under the per-user dataset
// root for audio files. The UI's "Scan Directory" button hits this when
// the user has audio files they've already dropped into their dataset
// folder via SSH/SFTP/etc and wants to import them without re-uploading.
//
// Path safety: the supplied path is resolved against
// server/data/datasets/u{userId}/ and rejected if it escapes via `..`.
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../lib/api.js";
import { db } from "../../../../lib/db.js";
import { safePathUnderDatasetsRoot } from "../../../../lib/training.js";
import {
  defaultSampleForFile,
  defaultSettings,
  buildDataframe,
} from "../../../../lib/training_storage.js";

const AUDIO_RE = /\.(mp3|wav|flac|ogg|opus|m4a)$/i;

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const datasetName = String(body.datasetName || "my_lora_dataset");
  const rel = String(body.audioDir || body.path || "").replace(/^\.\//, "");
  if (!rel) return json({ error: "audioDir required" }, 400);

  const dir = safePathUnderDatasetsRoot(user.id, rel);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return json({ error: `directory not found: ${rel}` }, 404);
  }

  // Recursive scan up to 4 levels deep — protects against accidentally
  // walking a giant unrelated tree the user pointed us at.
  const found = [];
  function walk(d, depth) {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (AUDIO_RE.test(e.name)) found.push(p);
    }
  }
  walk(dir, 0);

  const settings = {
    ...defaultSettings(datasetName),
    customTag: body.customTag || "",
    tagPosition: body.tagPosition || "append",
    allInstrumental: !!body.allInstrumental,
  };
  const samples = found.map((abs) => {
    // Store filenames RELATIVE to the per-user datasets root so
    // /api/training/audio can resolve them back later.
    const userRoot = path.join(safePathUnderDatasetsRoot(user.id, ""));
    const rel = path.relative(userRoot, abs);
    const s = defaultSampleForFile(path.basename(abs));
    s.audio = { path: rel };
    return s;
  });

  // Upsert a row so the UI can edit + save without re-scanning.
  const existing = db.prepare("SELECT id FROM lora_datasets WHERE user_id = ? AND name = ?")
    .get(user.id, datasetName);
  let dsId;
  if (existing) {
    db.prepare("UPDATE lora_datasets SET samples_json = ?, settings_json = ? WHERE id = ?")
      .run(JSON.stringify(samples), JSON.stringify(settings), existing.id);
    dsId = existing.id;
  } else {
    const r = db.prepare(
      "INSERT INTO lora_datasets (user_id, name, samples_json, settings_json) VALUES (?, ?, ?, ?)"
    ).run(user.id, datasetName, JSON.stringify(samples), JSON.stringify(settings));
    dsId = Number(r.lastInsertRowid);
  }

  return json({
    datasetId: dsId,
    sampleCount: samples.length,
    dataframe: buildDataframe(samples),
    status: `Scanned ${found.length} audio file${found.length === 1 ? "" : "s"} from ${rel}`,
  });
});
