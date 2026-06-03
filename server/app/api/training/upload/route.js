// POST /api/training/upload — multipart upload of N audio files into the
// per-user dataset directory. Files are written under
// server/data/datasets/u{userId}/{datasetSlug}/. Returns the placed
// filenames so the caller (handleUploadAndBuild) can wire them into the
// dataset row via /api/training/datasets/build.
import fs from "node:fs";
import path from "node:path";
import { json, handler, requireUser } from "../../../../lib/api.js";
import { datasetDir, sanitiseFilename } from "../../../../lib/training_storage.js";

const ALLOWED_EXT = new Set(["mp3", "wav", "flac", "ogg", "opus", "m4a"]);
const MAX_PER_FILE = 50 * 1024 * 1024;        // 50 MB cap per training audio
const MAX_PER_BATCH = 25 * MAX_PER_FILE;      // total cap per upload call

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const form = await req.formData();
  const datasetName = String(form.get("datasetName") || "my_lora_dataset");
  const dir = datasetDir(user.id, datasetName);

  // The frontend sends each file under the same `files` key (one append() per
  // selected file) — collect them.
  const files = form.getAll("files").filter((f) => f && typeof f !== "string");
  if (!files.length) return json({ error: "no files provided" }, 400);

  let totalBytes = 0;
  const written = [];
  for (const f of files) {
    const arr = await f.arrayBuffer();
    const buf = Buffer.from(arr);
    if (buf.length > MAX_PER_FILE) {
      return json({ error: `${f.name}: file too large (max 50MB per audio)` }, 413);
    }
    totalBytes += buf.length;
    if (totalBytes > MAX_PER_BATCH) {
      return json({ error: "batch too large (max 1.25GB total)" }, 413);
    }
    const safeName = sanitiseFilename(f.name);
    const ext = (safeName.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return json({ error: `${f.name}: unsupported extension .${ext}` }, 415);
    }
    // Avoid clobbering an existing file with the same name — suffix duplicates.
    let target = path.join(dir, safeName);
    let dedupe = 1;
    while (fs.existsSync(target)) {
      const stem = safeName.replace(/\.[^.]+$/, "");
      target = path.join(dir, `${stem}_${dedupe}.${ext}`);
      dedupe++;
    }
    fs.writeFileSync(target, buf);
    written.push({ filename: path.basename(target), sizeBytes: buf.length });
  }

  return json({
    datasetName,
    datasetDir: dir,
    files: written,
    count: written.length,
  });
});
