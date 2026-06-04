// Upload helpers — share the file-staging logic between /api/uploads and
// /api/uploads/from-track. Files always land in ComfyUI's input/ folder so
// the LoadAudio node can pick them up by basename. We never trust the
// client-supplied filename or mime; the extension is derived from sniffed
// magic bytes and the on-disk name is a random nonce.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "./db.js";

const COMFYUI_ROOT = process.env.COMFYUI_ROOT || "/home/raveuk/comfy/ComfyUI";
export const INPUT_DIR = path.join(COMFYUI_ROOT, "input");

// 30 MB cap. ACE-Step tasks chew on at most a few minutes of audio; anything
// larger is a misconfigured client or an abuse attempt.
export const MAX_BYTES = 30 * 1024 * 1024;

// Sniff the first few bytes and decide if this is real audio. We accept
// MP3 (ID3v2 header or raw MPEG frame sync), WAV (RIFF…WAVE), FLAC (fLaC),
// and M4A/AAC (…ftyp). Returns the canonical extension or null.
export function sniffAudioExt(buf) {
  if (!buf || buf.length < 12) return null;
  // ID3v2 tag → mp3
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return "mp3";
  // Raw MPEG frame: 0xFF Ex/Fx (sync = 11 ones; layer = 01 → MP3)
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3";
  // RIFF....WAVE
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45
  ) return "wav";
  // fLaC
  if (buf[0] === 0x66 && buf[1] === 0x4c && buf[2] === 0x61 && buf[3] === 0x43) return "flac";
  // …ftyp (M4A/AAC) — ftyp lives at byte 4
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return "m4a";
  return null;
}

// Persist a byte buffer into ComfyUI/input/ under a random name, validate
// magic bytes, and insert an uploads row. Returns { uploadId, filename }
// where filename is the basename (LoadAudio takes just the name, not a path).
// Magic-byte sniffer for image uploads. Returns the canonical extension
// ('png', 'jpg', 'webp') or null. Used by /api/musicvideo/upload-image
// to validate the reference picture the Wan 2.2 S2V workflow uses.
export function sniffImageExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "webp";
  // GIF87a / GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "gif";
  return null;
}

// Same job as stageBuffer for audio but for the reference image. We branch
// because the magic-byte sniffer and the on-disk prefix differ.
export function stageImageBuffer({ buf, userId, originalName = null, mime = null }) {
  if (buf.length > MAX_BYTES) {
    const err = new Error("image too large"); err.status = 413; throw err;
  }
  const ext = sniffImageExt(buf);
  if (!ext) {
    const err = new Error("unsupported image format (need png/jpg/webp/gif)");
    err.status = 415; throw err;
  }
  const nonce = crypto.randomBytes(4).toString("hex");
  const filename = `img_u${userId}_${nonce}.${ext}`;
  const dest = path.join(INPUT_DIR, filename);
  fs.writeFileSync(dest, buf);
  const row = db.prepare(
    `INSERT INTO uploads (user_id, filename, original_name, mime, size_bytes, source)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, filename, originalName, mime, buf.length, "musicvideo-image");
  return { uploadId: Number(row.lastInsertRowid), filename };
}

export function stageBuffer({ buf, userId, originalName = null, mime = null, source = "upload", trackId = null }) {
  if (buf.length > MAX_BYTES) {
    const err = new Error("file too large");
    err.status = 413;
    throw err;
  }
  const ext = sniffAudioExt(buf);
  if (!ext) {
    const err = new Error("unsupported audio format (need mp3/wav/flac/m4a)");
    err.status = 415;
    throw err;
  }
  // 8 hex chars = 32 bits of entropy; enough to avoid collisions across
  // millions of concurrent uploads while keeping the filename short.
  const nonce = crypto.randomBytes(4).toString("hex");
  const filename = `upload_u${userId}_${nonce}.${ext}`;
  const dest = path.join(INPUT_DIR, filename);
  fs.writeFileSync(dest, buf);

  const row = db.prepare(
    `INSERT INTO uploads (user_id, filename, original_name, mime, size_bytes, source, track_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, filename, originalName, mime, buf.length, source, trackId);

  return { uploadId: Number(row.lastInsertRowid), filename };
}

// Get an upload row scoped to a user. Used by every downstream task to
// verify the requester owns the staged file.
export function getUploadForUser(uploadId, userId) {
  return db.prepare("SELECT * FROM uploads WHERE id = ? AND user_id = ?").get(Number(uploadId), userId);
}

// Best-effort cleanup of staged files older than `hours`. Runs lazily — call
// from any /api/uploads access path so we don't need a separate cron. Not
// transactional with the row delete; if the file is gone we still drop the
// row, and if the row is gone we leave the file (next sweep will pick it up).
export function sweepOldUploads(hours = 24) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  const cutoffIso = new Date(cutoff).toISOString().replace("T", " ").slice(0, 19);
  const old = db.prepare("SELECT id, filename FROM uploads WHERE created_at < ?").all(cutoffIso);
  for (const row of old) {
    try { fs.unlinkSync(path.join(INPUT_DIR, row.filename)); } catch {}
    db.prepare("DELETE FROM uploads WHERE id = ?").run(row.id);
  }
  return old.length;
}
