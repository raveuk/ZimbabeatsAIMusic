// Filesystem layout + helpers for the LoRA training dataset format.
//
// The upstream ACE-Step trainer expects, per training audio:
//   {basename}.mp3
//   {basename}_prompt.txt   (comma-separated tags)
//   {basename}_lyrics.txt   (lyrics text, optional)
//
// We persist datasets on disk under server/data/datasets/u{userId}/{name}/
// so `convert2hf_dataset.py --data_dir <that-dir>` can consume them directly,
// AND we keep a `dataset.json` alongside as our richer metadata source (the
// per-sample fields the UI table edits — caption, genre, bpm, key, etc.).
//
// The lora_datasets row stores samples_json + the dataset_path; the on-disk
// files are the source of truth the trainer reads.
import fs from "node:fs";
import path from "node:path";
import { DATASETS_ROOT } from "./training.js";

// "my song!.mp3" → "my_song.mp3"  (basename only, no path traversal)
export function sanitiseFilename(name) {
  const base = path.basename(String(name || "")).replace(/[^a-zA-Z0-9._-]+/g, "_");
  return base || "sample";
}

// Per-user-per-dataset directory, mkdir'd on access. Names get slugified so
// "My Awesome LoRA" survives as "my_awesome_lora".
export function datasetDir(userId, datasetName) {
  const slug = String(datasetName || "default").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80) || "default";
  const dir = path.join(DATASETS_ROOT, `u${userId}`, slug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Build a TrainingSample default for a newly-uploaded audio file. The UI
// table edits these in place; we mirror them to disk on `Save Dataset`.
export function defaultSampleForFile(filename) {
  const stem = filename.replace(/\.(mp3|wav|flac|ogg|opus|m4a)$/i, "");
  return {
    filename,
    stem,
    audio: { path: filename },  // UI's getTrainingAudioUrl turns this into a signed URL
    caption: "",
    genre: "",
    promptOverride: "Use Global Ratio",
    tags: "",
    lyrics: "",
    rawLyrics: "",
    bpm: 0,
    key: "",
    timeSignature: "",
    duration: 0,
    language: "",
    instrumental: true,
  };
}

// Default DatasetSettings — the UI provides these too but we ship a safe
// baseline so the row never has nulls.
export function defaultSettings(datasetName) {
  return {
    datasetName: datasetName || "my_lora_dataset",
    customTag: "",
    tagPosition: "append",
    allInstrumental: false,
    genreRatio: 0.5,
  };
}

// Compose the dataframe shape the UI's parseDataframe() expects.
//   { headers: string[], data: any[][] }
const DATAFRAME_HEADERS = [
  "idx", "filename", "caption", "genre", "tags", "lyrics",
  "bpm", "key", "timeSignature", "duration", "language", "instrumental",
];
export function buildDataframe(samples) {
  const data = samples.map((s, i) => DATAFRAME_HEADERS.map((h) =>
    h === "idx" ? i : (s[h] ?? "")
  ));
  return { headers: DATAFRAME_HEADERS, data };
}

// Materialise the dataset to the ACE-Step on-disk format so the trainer's
// convert2hf_dataset.py can read it. Writes/overwrites:
//   {datasetDir}/{stem}.mp3 (or whatever ext)
//   {datasetDir}/{stem}_prompt.txt    (comma-separated tags)
//   {datasetDir}/{stem}_lyrics.txt    (optional)
//   {datasetDir}/dataset.json         (our metadata copy)
export function writeDatasetToDisk(dir, { samples, settings }) {
  fs.mkdirSync(dir, { recursive: true });
  const samplesOut = [];
  for (const sample of samples || []) {
    const stem = (sample.stem || sample.filename || "").replace(/\.(mp3|wav|flac|ogg|opus|m4a)$/i, "");
    if (!stem) continue;

    const promptPieces = [];
    if (sample.genre)       promptPieces.push(sample.genre);
    if (sample.tags)        promptPieces.push(sample.tags);
    if (sample.bpm > 0)     promptPieces.push(`${sample.bpm} bpm`);
    if (sample.key)         promptPieces.push(sample.key);
    if (sample.instrumental) promptPieces.push("instrumental");
    else if (sample.language)  promptPieces.push(`${sample.language} vocal`);
    if (settings?.customTag) {
      if (settings.tagPosition === "prepend") promptPieces.unshift(settings.customTag);
      else if (settings.tagPosition === "replace") promptPieces.splice(0, promptPieces.length, settings.customTag);
      else promptPieces.push(settings.customTag);
    }
    const promptText = promptPieces.filter(Boolean).join(", ");

    fs.writeFileSync(path.join(dir, `${stem}_prompt.txt`), promptText, "utf8");
    if (sample.lyrics || sample.rawLyrics) {
      fs.writeFileSync(
        path.join(dir, `${stem}_lyrics.txt`),
        String(sample.lyrics || sample.rawLyrics),
        "utf8",
      );
    }
    samplesOut.push({ ...sample, stem });
  }

  fs.writeFileSync(
    path.join(dir, "dataset.json"),
    JSON.stringify({ samples: samplesOut, settings }, null, 2),
    "utf8",
  );
  return path.join(dir, "dataset.json");
}

// Inverse of writeDatasetToDisk — read the dataset.json (and tolerate the
// presence of just the txt-files if the JSON was deleted).
export function readDatasetFromDisk(dir) {
  const jsonPath = path.join(dir, "dataset.json");
  if (fs.existsSync(jsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      return { samples: parsed.samples || [], settings: parsed.settings || defaultSettings() };
    } catch {}
  }
  // Fallback: rebuild from the audio + txt files on disk.
  const audios = fs.readdirSync(dir).filter((f) => /\.(mp3|wav|flac|ogg|opus|m4a)$/i.test(f));
  const samples = audios.map((filename) => {
    const stem = filename.replace(/\.(mp3|wav|flac|ogg|opus|m4a)$/i, "");
    const s = defaultSampleForFile(filename);
    s.stem = stem;
    try { s.tags = fs.readFileSync(path.join(dir, `${stem}_prompt.txt`), "utf8").trim(); } catch {}
    try { s.lyrics = fs.readFileSync(path.join(dir, `${stem}_lyrics.txt`), "utf8").trim(); } catch {}
    return s;
  });
  return { samples, settings: defaultSettings() };
}
