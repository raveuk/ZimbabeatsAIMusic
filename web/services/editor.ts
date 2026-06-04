// Shared "Edit Audio" launcher used by the SongDropdownMenu, the RightSidebar
// quick-action button, and the SongProfile edit button. Centralised so the
// 3 call-sites all get the same MultiTrack-with-stems behaviour:
//
//   1. Build the AudioMass URL with audio + auth params.
//   2. Look up existing stems for the track via /api/stems.
//   3. If none, kick off Demucs (POST /api/jobs/<id>/stems) — fire a "toast"
//      custom event so App.tsx surfaces a "Extracting stems…" banner while
//      Demucs runs (≈30-60s on the 3090).
//   4. Append the stems list to the URL so the AudioMass bridge script puts
//      AudioMass into MultiTrack mode with one channel per stem.
//
// On failure at any step we fall back to opening AudioMass in single-track
// mode with just the master mp3 — the editor still loads, the user just
// doesn't get the per-channel view.

import { Song } from '../types';
import { API_BASE, songsApi } from './api';
import { auth as firebaseAuth } from './firebase';

type ToastKind = 'success' | 'error' | 'info';

function fireToast(message: string, type: ToastKind = 'info') {
  window.dispatchEvent(
    new CustomEvent('myuzika:toast', { detail: { message, type } }),
  );
}

export async function openAudioEditor(song: Song): Promise<void> {
  if (!song?.id || !song?.audioUrl) return;

  const audioUrl = song.audioUrl.startsWith('http')
    ? song.audioUrl
    : `${window.location.origin}${song.audioUrl}`;
  const token = (await firebaseAuth.currentUser?.getIdToken()) || '';
  const params = new URLSearchParams({
    audio: audioUrl,
    track: String(song.id),
    token,
    api: API_BASE,
  });

  // Open the editor tab SYNCHRONOUSLY in the user-gesture window. Awaiting any
  // long-running API call before window.open trips the browser's popup blocker
  // (it stops treating window.open as user-initiated after ~1s).
  //
  // The tab opens in single-track mode (audio only). Stems get loaded in via
  // postMessage once Demucs / the stems lookup finishes in the background,
  // which the AudioMass bridge script listens for and swaps in MultiTrack.
  const tab = window.open(
    `/audiomass/index.html?${params.toString()}`,
    '_blank',
  );
  if (!tab) {
    fireToast('Popup blocked — allow popups for Myuzika and try again', 'error');
    return;
  }

  // Background: find or extract stems, then push them to the open tab.
  void (async () => {
    let stems: Record<string, string> = {};
    try {
      const { tracks } = await songsApi.listStems();
      const t = tracks.find((x) => String(x.id) === String(song.id));
      if (t?.stems && Object.keys(t.stems).length) stems = t.stems;
    } catch { /* fall through to extract */ }

    if (!Object.keys(stems).length) {
      fireToast('Extracting stems for the editor… (≈ 30–60 s)', 'info');
      try {
        const r = await songsApi.extractStems(String(song.id));
        stems = r.stems || {};
        if (Object.keys(stems).length) {
          fireToast('Stems ready — loading into editor', 'success');
        }
      } catch (e) {
        console.error('extractStems failed', e);
        fireToast('Stem extraction failed — staying in single-track view', 'error');
        return;
      }
    }

    if (!Object.keys(stems).length || tab.closed) return;
    const list = Object.entries(stems).map(([name, url]) => ({ name, url }));
    try {
      tab.postMessage({ type: 'myuzika:stems-ready', stems: list }, '*');
    } catch (e) {
      console.error('postMessage to editor tab failed', e);
    }
  })();
}
