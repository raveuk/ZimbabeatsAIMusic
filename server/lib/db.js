// SQLite via Node's built-in driver. One file under server/data/.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// Reuse a single connection across hot reloads in dev.
const g = globalThis;
export const db = g.__musicDb ?? (g.__musicDb = new DatabaseSync(path.join(DATA_DIR, "app.db")));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tracks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    title       TEXT,
    params_json TEXT NOT NULL,
    prompt_id   TEXT,
    status      TEXT NOT NULL DEFAULT 'queued',
    filename    TEXT,
    subfolder   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS playlists (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    added_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (playlist_id, track_id)
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Enforce the ON DELETE CASCADE foreign keys above.
db.exec("PRAGMA foreign_keys = ON;");
// WAL mode lets readers and one writer work concurrently without "database is
// locked" errors when refreshTrack and a regenerate-cover request overlap.
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");

// Lightweight migration: add cover columns to tracks if they're not there yet.
// (SQLite has no IF NOT EXISTS on ALTER TABLE; we read the schema first.)
const cols = db.prepare("PRAGMA table_info(tracks)").all().map((c) => c.name);
if (!cols.includes("cover_prompt_id")) db.exec("ALTER TABLE tracks ADD COLUMN cover_prompt_id TEXT");
if (!cols.includes("cover_filename"))  db.exec("ALTER TABLE tracks ADD COLUMN cover_filename  TEXT");
if (!cols.includes("cover_subfolder")) db.exec("ALTER TABLE tracks ADD COLUMN cover_subfolder TEXT");

// Role for the per-user authorisation check. 'user' (default) or 'admin'.
const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userCols.includes("role")) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
// Soft block: a disabled user can't log in or hit any authed route.
if (!userCols.includes("disabled")) db.exec("ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0");
// Per-user lifetime track quota. NULL = unlimited (default). When set,
// /api/generate refuses once they reach that many existing tracks.
if (!userCols.includes("track_quota")) db.exec("ALTER TABLE users ADD COLUMN track_quota INTEGER");

// Uploads table — staged audio files in ComfyUI/input/ that back the
// Transform tasks (Transcribe, Cover, Repaint, Extend, Edit). Files are
// physically copied into ComfyUI's input/ folder and the row keeps the
// link so we can clean up after 24h and authorize access by user_id.
db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    original_name TEXT,
    mime          TEXT,
    size_bytes    INTEGER NOT NULL,
    source        TEXT NOT NULL DEFAULT 'upload',
    track_id      INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Add lrc_path so Phase 2 can cache transcribed karaoke output per track.
if (!cols.includes("lrc_path")) db.exec("ALTER TABLE tracks ADD COLUMN lrc_path TEXT");

// ---------------------------------------------------------------------------
// LoRA training (Task #19) — the Training page wires through these tables.
// `lora_datasets` is the user's labeled songs (samples_json holds the per-row
// {filename, tags, lyrics, …} list). `lora_jobs` tracks every preprocess /
// train run as a Python child process; refreshLoraJob() tails the log file
// to update progress / loss without blocking the request thread.
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS lora_datasets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    samples_json  TEXT NOT NULL,
    settings_json TEXT,
    dataset_path  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
  );
  CREATE TABLE IF NOT EXISTS lora_jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dataset_id      INTEGER REFERENCES lora_datasets(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL,
    pid             INTEGER,
    status          TEXT NOT NULL DEFAULT 'queued',
    params_json     TEXT NOT NULL,
    log_path        TEXT,
    current_step    INTEGER DEFAULT 0,
    total_steps     INTEGER DEFAULT 0,
    last_loss       REAL,
    loss_log_json   TEXT,
    tensor_path     TEXT,
    lora_filename   TEXT,
    error_message   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
// Per-user LoRA quota — NULL = unlimited, mirrors track_quota.
if (!userCols.includes("lora_quota")) db.exec("ALTER TABLE users ADD COLUMN lora_quota INTEGER");

// ---------------------------------------------------------------------------
// AI music videos (Task #32) — Wan 2.2 S2V generates video synced to one of
// the user's tracks. Each row is one render job: ties an existing track and a
// staged reference-image upload, records the ComfyUI prompt_id while running,
// and the saved MP4 filename once done.
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS music_videos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id        INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
    image_upload_id INTEGER REFERENCES uploads(id) ON DELETE SET NULL,
    prompt_id       TEXT,
    status          TEXT NOT NULL DEFAULT 'queued',
    style_prompt    TEXT,
    params_json     TEXT,
    filename        TEXT,
    subfolder       TEXT,
    error_message   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
// users.musicvideo_quota — NULL = unlimited, mirrors track_quota.
if (!userCols.includes("musicvideo_quota")) db.exec("ALTER TABLE users ADD COLUMN musicvideo_quota INTEGER");
