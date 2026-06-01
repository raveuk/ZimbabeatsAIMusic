# AI Music App

A friend-facing app for generating AI music with your ComfyUI **"Music AI"** workflow
(ACE-Step 1.5 turbo). Users type a style + lyrics in a mobile app and get a song back —
they never see the node graph.

```
Expo app (phone, home Wi-Fi)
   │  login + { style, lyrics, duration, seed?, bpm?, key? }
   ▼
Next.js backend  (this machine, 0.0.0.0:3000)  ──►  ComfyUI (127.0.0.1:8188)
  - per-user accounts (SQLite)                       POST /prompt, /history, /view
  - injects inputs into workflow.api.json
  ◄── streams the finished mp3 back to the app
```

**Access model:** LAN / Wi-Fi only. The phone and this machine must be on the same
network. Nothing is exposed to the internet.

## Layout
```
music-app/
  workflow.api.json          API-format copy of the workflow (generated)
  scripts/convert-workflow.mjs   UI workflow -> API format converter
  scripts/smoke-test.mjs         submits the workflow straight to ComfyUI
  server/                    Next.js backend (API only + status page)
  mobile/                    Expo app (Create / Library screens)
```

## Prerequisites
1. **ComfyUI running with `--listen`** so it (and the backend) are reachable:
   ```bash
   cd ~/comfy/ComfyUI && ./.venv/bin/python main.py --listen
   ```
2. The "Music AI" workflow's models installed (already the case on this machine).

## 1. Backend
```bash
cd music-app/server
npm install
npm run dev        # binds 0.0.0.0:3000
```
Visit `http://192.168.1.162:3000` in a browser to confirm it's up.
Open the firewall port if needed: `sudo ufw allow 3000`.

Config via env vars (optional):
- `COMFY_URL` (default `http://127.0.0.1:8188`)
- `COMFY_OUTPUT_DIR` (default `/home/raveuk/comfy/ComfyUI/output`) — where generated
  mp3s live; the backend deletes files here when a track is deleted
- `OLLAMA_URL` (default `http://127.0.0.1:11434`) — for the AI-lyrics feature
- `OLLAMA_MODEL` (default `hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:q4_K_M`) — the
  local model that writes lyrics; swap for `gemma3:27b` etc. for higher quality
- `JWT_SECRET` (otherwise auto-generated and saved to `server/data/jwt.secret`)
- **SMTP (for "Forgot password?" emails):** `SMTP_HOST`, `SMTP_PORT` (465 or 587),
  `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (defaults to `SMTP_USER`). For Gmail use
  `smtp.gmail.com` / `465`, your address as the user, and an **app password**
  (https://myaccount.google.com/apppasswords — not your normal password).
- `APP_URL` — base URL put in the reset link (default: derived from the request,
  e.g. `http://192.168.1.162:3000`)

### Forgot password
The login screen has a **"Forgot password?"** link. The user enters their email and the
backend emails a one-hour, single-use reset link (`/reset?token=…`) that opens a web form
to set a new password. The link is LAN-only — open it on the same Wi-Fi as this server.
If SMTP isn't configured yet, the backend **logs the reset link to its console** instead,
so you (the host) can relay it manually until email is set up.

### AI lyrics ("✨ Write lyrics for me")
The Create screen has a toggle that, instead of typing lyrics, lets the user enter a
**theme**. The **backend calls Ollama's HTTP API directly** (`server/lib/ollama.js`),
gets the lyrics text, stores it on the track (so it shows in the app), and passes it into
the workflow's `lyrics` widget as a plain string. The ComfyUI graph is unchanged — `clip`
stays wired and `lyrics` is just populated with the generated text.

Requires only **Ollama running** (`http://127.0.0.1:11434`) with the configured model
pulled. **No custom ComfyUI node needed.** Because the backend reads only the `response`
field, this works with **any** model — local *or* `:cloud` models (the latter omit the
`context` field that the `comfyui-ollama` node chokes on, but we never touch it).

Data (SQLite + JWT secret) lives in `server/data/` and is gitignored.

## 2. Mobile app
The backend address is set in `mobile/config.js`:
```js
export const API_BASE = "http://192.168.1.162:3000";
```
Update that one line if this machine's LAN IP changes (`ip -4 addr`).

```bash
cd music-app/mobile
npx expo start
```
Open **Expo Go** on a phone on the same Wi-Fi and scan the QR code.

## Adding friends
Each friend taps **Sign up** in the app to create their own account. Everyone shares the
same ComfyUI GPU, which generates one track at a time (jobs queue automatically); the
Library tab shows each track's queue position and status.

## Regenerating the workflow template
If you change the workflow in ComfyUI, re-export and reconvert (ComfyUI must be running):
```bash
cd music-app
node scripts/convert-workflow.mjs "/home/raveuk/comfy/ComfyUI/user/default/workflows/Music AI.json" workflow.api.json
cp workflow.api.json server/workflow.api.json
```
The converter reads node schemas from the live `/object_info`, maps `widgets_values` onto
named inputs by type, skips `control_after_generate` values, and inlines PrimitiveNode
constants into their consumers. If you rename nodes or change IDs, update the node-id
constants in `server/lib/workflow.js`.

## API reference
All endpoints return JSON; protected ones need `Authorization: Bearer <token>`.

| Method | Path | Body / notes |
|---|---|---|
| POST | `/api/auth/register` | `{ email, password }` → `{ token, user }` |
| POST | `/api/auth/login` | `{ email, password }` → `{ token, user }` |
| POST | `/api/auth/forgot` | `{ email }` → `{ ok: true }` (always; emails a reset link if the user exists) |
| POST | `/api/auth/reset` | `{ token, password }` → `{ ok: true }` (single-use, 1-hour token) |
| GET | `/api/options` | public; picker lists `{ languages, keys, timeSignatures }` + workflow defaults |
| POST | `/api/generate` | `{ style, lyrics, duration?, language?, seed?, bpm?, key?, timesignature?, title? }` or `{ writeLyrics: true, theme, ... }` for AI lyrics → `{ trackId, promptId }` |
| GET | `/api/jobs` | your tracks (auto-refreshes in-flight statuses) |
| GET | `/api/jobs/:id` | one track's status |
| DELETE | `/api/jobs/:id` | delete a track: removes the row, cascades out of all playlists, **and deletes the mp3 from disk** |
| GET | `/api/audio/:id` | streams the finished mp3 |
| GET | `/api/playlists` | your playlists with track counts |
| POST | `/api/playlists` | `{ name }` → create a playlist |
| GET | `/api/playlists/:id` | playlist + its tracks |
| DELETE | `/api/playlists/:id` | delete a playlist (tracks remain in Library) |
| POST | `/api/playlists/:id/tracks` | `{ trackId }` → add a track |
| DELETE | `/api/playlists/:id/tracks/:trackId` | remove a track from the playlist |

## Notes
- Generation is GPU-bound and slow — ~2-3 min for a 30s clip on this machine. The app
  polls every 5s while a track is generating and shows a **live progress bar** (the
  backend subscribes to ComfyUI's WebSocket and reports each track's step progress via
  the `progress` field on `/api/jobs`).
- The Create screen can **preview AI lyrics** before rendering: with "✨ Write lyrics for
  me" on, tap **Write lyrics** to generate them (via `POST /api/lyrics`, no GPU/track),
  edit if you like, then Generate — the song uses exactly those lyrics.
- Auth runs over plain HTTP, which is fine on a trusted LAN. If you ever expose this
  beyond the LAN, put it behind HTTPS (reverse proxy) first.
