# Issue — Public/Private Track Toggle Not Wired

**Issue ID:** public_private_toggle_20260613_002619
**Date:** 2026-06-13
**Reported by:** user
**Status:** Fixed (commit `f01a6a5`)
**Symptom:** Turning a track from private to public "is not being setup/wired" —
nothing in the UI made a track public, and tracks always appeared private.

---

## 1. Diagnosis — why it didn't work

The **backend was already fully built**; the failure was entirely on the
frontend, in two places.

### Backend — all present and correct ✅
- `tracks` table has `is_public INTEGER NOT NULL DEFAULT 0`.
- `PATCH /api/jobs/[id]/privacy` (`server/app/api/jobs/[id]/privacy/route.js`)
  flips the bit. Owner-checked. Accepts `{ isPublic }` in the body or toggles
  when omitted. Updates the row and returns the new value.
- `server/lib/tracks.js` `publicTrack()` returns `isPublic: !!t.is_public`.
- `GET /api/jobs` maps every track through `publicTrack()`, so each track's
  real `isPublic` was being sent to the client.
- Public listings `/api/songs/public` and `/api/songs/public/featured` query
  `WHERE t.is_public = 1 AND t.status = 'done'`.
- `songsApi.togglePrivacy()` existed in `web/services/api.ts` (calls the PATCH).

### Frontend — two gaps ❌
1. **Mapper threw the value away.** `toFspeciiSong()` in
   `web/services/api.ts` hardcoded `is_public: false` (stale comment: "we don't
   expose public sharing yet"), and the `BackendTrack` interface didn't even
   declare an `isPublic` field. So no matter what the backend said, every track
   was mapped to private — and any successful toggle was visually reverted on
   the next refresh.
2. **No UI called the toggle.** `songsApi.togglePrivacy()` existed but **nothing
   in the app invoked it** — there was no menu item or button anywhere. (Grep
   for `togglePrivacy` across components returned only an unrelated footer
   "Privacy" link.)

Net: the plumbing ran end-to-end on the server, but the client never showed the
real state and never offered a way to change it.

---

## 2. The fix — code changes

Commit `f01a6a5` — 5 files.

### a) `web/services/api.ts` — read the real value
```diff
  // BackendTrack interface
   coverPending: boolean;
+  isPublic?: boolean; // server/lib/tracks.js publicTrack() returns this
 }
```
```diff
  // toFspeciiSong()
-  is_public: false, // we don't expose public sharing yet
+  is_public: !!t.isPublic, // real value from the backend (publicTrack)
```

### b) `web/components/SongDropdownMenu.tsx` — the button
- Imported `Globe` and `Lock` icons.
- Added optional prop `onTogglePublic?: () => void`.
- Added an owner-only menu item that swaps label/icon by current state:
```tsx
{onTogglePublic && (
  <MenuItem
    icon={song.isPublic ? <Lock size={14} /> : <Globe size={14} />}
    label={song.isPublic ? 'Make Private' : 'Make Public'}
    onClick={() => handleAction(onTogglePublic)}
  />
)}
```

### c) `web/App.tsx` — the handler + wiring
New `handleTogglePublic(song)`:
- optimistically flips `isPublic` in `songs` + `selectedSong`
- calls `songsApi.togglePrivacy(song.id, token)`
- reconciles with the server's returned `isPublic`
- reverts on error and toasts success/failure
```tsx
const handleTogglePublic = async (song: Song) => {
  if (!token) return;
  const newPublic = !song.isPublic;
  setSongs(prev => prev.map(s => s.id === song.id ? { ...s, isPublic: newPublic } : s));
  setSelectedSong(prev => prev && prev.id === song.id ? { ...prev, isPublic: newPublic } : prev);
  try {
    const { isPublic } = await songsApi.togglePrivacy(song.id, token);
    setSongs(prev => prev.map(s => s.id === song.id ? { ...s, isPublic } : s));
    setSelectedSong(prev => prev && prev.id === song.id ? { ...prev, isPublic } : prev);
    showToast(isPublic ? 'Track is now public' : 'Track is now private', 'success');
  } catch (e) {
    setSongs(prev => prev.map(s => s.id === song.id ? { ...s, isPublic: song.isPublic } : s));
    setSelectedSong(prev => prev && prev.id === song.id ? { ...prev, isPublic: song.isPublic } : prev);
    showToast('Failed to update privacy', 'error');
  }
};
```
Passed `onTogglePublic={handleTogglePublic}` to `<SongList>` and `<LibraryView>`.

### d) `web/components/SongList.tsx` — thread it through (two levels)
- Added `onTogglePublic?: (song: Song) => void` to the SongList props and
  `onTogglePublic?: () => void` to the inner SongRow props.
- Destructured it in both the SongList component and the SongRow component.
- Passed `onTogglePublic={() => onTogglePublic?.(item.song)}` to SongRow, and
  `onTogglePublic={onTogglePublic ? () => onTogglePublic?.() : undefined}` to
  the SongDropdownMenu.

### e) `web/components/LibraryView.tsx`
- Added `onTogglePublic?: (song: Song) => void` prop, destructured it, and
  passed `onTogglePublic={() => onTogglePublic?.(song)}` to both
  SongDropdownMenu usages (All Songs + Liked tabs).

---

## 3. How to verify
1. Open one of YOUR tracks' **"..." menu** (owner-only item).
2. Tap **Make Public** → toast "Track is now public", lock icon disappears.
3. The track now satisfies `is_public = 1` and appears in
   `/api/songs/public` + the landing-page listen wall.
4. **"..." → Make Private** reverses it (lock icon returns).

---

## 4. Notes / follow-ups
- This is also what unblocks the **landing page listen wall** — it pulls from
  `is_public = 1 AND status = 'done'`, so it stays empty until tracks are made
  public.
- The privacy PATCH route is owner-checked server-side (`row.user_id !==
  user.id → 404`), so the toggle is safe even though the menu item is gated to
  `isOwner` on the client.
