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
