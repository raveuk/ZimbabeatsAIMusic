# Sprint — 2026-06-11 — Artist/Celebrity Voices (LOCAL TEST ONLY)

## Goal
Add a second voice dropdown category for **celebrity / singer / artist** RVC voices,
on top of the existing Natural (Male/Female) voices. **Local testing only — must NOT
ship to the public myuzika.com site** (right-of-publicity / likeness legal exposure on
a live commercial product; see Findings in
`issues/autotune_generation_20260611_114136.md` context).

## Decision: option (b), gated local
- User wants to source real artist voice models and test them locally.
- Keep them behind an env flag so production never serves them by accident.
- The mechanism is build-once: any RVC `.pth` (+ optional `.index`) dropped into the
  artist folder appears in the Artist category automatically.

## Current voice inventory (audited 2026-06-11)
6 stock voices, **0 artists**:
- Natural/Character (stock, safe): Claire (F), Male_1 (Generic M), Fuji (F), Mae_v2 (F),
  Monika (F), Sayano (F) — all from `SayanoAI/RVC-Studio` HF repo.
- Artist/Celebrity: NONE yet — must be supplied by the user.

## Design

### Voice categories
The voice picker becomes grouped:
- **Natural** — Generic Male, Claire (default-safe, always on)
- **Character** — Fuji, Mae, Monika, Sayano (stock, always on)
- **Artist** — user-supplied celebrity/singer models — **only shown when
  `ENABLE_ARTIST_VOICES=1`** on the backend (local dev). Off in prod.

### Where artist models live
```
/home/raveuk/comfy/ComfyUI/models/TTS/RVC/artists/   <-- new subfolder
    <artist_name>.pth
    <artist_name>.index   (optional, improves quality)
```
Keeping them in a subfolder cleanly separates the user-supplied artist set from the
safe stock voices, and makes the prod-exclusion filter trivial (path contains
`/artists/`).

### Gating
- `/api/models` reads `process.env.ENABLE_ARTIST_VOICES`. When unset/`0`, any voice whose
  file lives under `artists/` (or is tagged artist) is filtered out of the `voices` list.
- Local `.env.local` on the dev backend sets `ENABLE_ARTIST_VOICES=1`.
- The deployed backend never sets it → artist voices invisible in prod.

### How the user adds an artist voice (local)
1. Obtain an RVC model (`.pth`, ideally with matching `.index`) — e.g. from weights.gg,
   voice-models.com, or train via TTS-Audio-Suite's `RVC 🎓 Model Training` workflow.
2. Drop the files into `ComfyUI/models/TTS/RVC/artists/`.
3. Restart ComfyUI (so `LoadRVCModelNode` re-scans) — or it auto-discovers on next call.
4. The voice appears in the app's **Artist** category (local only).

## Tasks
- [x] Create `models/TTS/RVC/artists/` folder + a README placeholder.
- [x] `/api/models`: add `category` field to each voice (natural/character/artist),
      filter artist out unless `ENABLE_ARTIST_VOICES=1`. (route.js:99-138)
- [x] `labelFor`: artist filenames fall through to the generic clean-name path
      (strip extension/underscores) — no per-artist hardcoding needed.
- [x] Frontend voice dropdown: render grouped by category via <optgroup>
      (Natural / Character / Artist / Singer). Falls back to flat list if backend
      sends no category. (CreatePanel.tsx voice select)
- [x] `.env.local`: `ENABLE_ARTIST_VOICES=1` for local testing.
- [ ] Verify end-to-end (needs backend restart to load the env flag + artist .pth
      files dropped in).

## How to finish testing (user steps)
1. Restart the backend so `.env.local`'s new flag loads:
   - `cd /home/raveuk/comfy/music-app/server` then restart `next dev`
     (env vars only load at process start; code hot-reloads but env doesn't).
2. Obtain artist RVC models (`.pth` + optional `.index`) and drop into
   `/home/raveuk/comfy/ComfyUI/models/TTS/RVC/artists/`.
3. Restart ComfyUI so `LoadRVCModelNode` re-scans (`sudo systemctl restart comfyui`).
4. Refresh the app → Voice Clone dropdown now has an **Artist / Singer** group.
5. Pick one, generate, listen. Tune `index_ratio` in workflow.clone.api.json node 204
   if it's too auto-tuned (lower) or not matching the target enough (higher).

## Legal / safety note (carried from audit)
Cloning identifiable real artists for a public service is a likeness/publicity issue.
This feature is deliberately **local-test-gated**. Do NOT flip `ENABLE_ARTIST_VOICES`
on in the deployed backend without a legal decision. Stock voices (Claire, Male_1, etc.)
remain safe for production.

## Status
- [x] Sprint folder + this plan doc
- [ ] Implementation (in progress)
