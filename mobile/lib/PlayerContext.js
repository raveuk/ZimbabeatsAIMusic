// Global audio player. A single expo-audio player instance lives here and is
// shared via React Context — so tapping ▶ on a track in Library and then
// switching to Playlists keeps the same song playing without remount.
//
// Without this, useAudioPlayer was created in each TrackList, so navigating
// away unmounted the player and stopped the audio.
import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { getToken } from "./api";
import { API_BASE } from "../config";

const PlayerCtx = createContext(null);

// Append the JWT as ?token=… so native players don't need to forward an
// Authorization header (which Android's ExoPlayer drops).
async function signedUrl(path) {
  if (!path) return null;
  const t = await getToken();
  if (!t) return null;
  return `${API_BASE}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(t)}`;
}

export function PlayerProvider({ children }) {
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [current, setCurrent] = useState(null); // the track object that's loaded

  const play = useCallback(async (track) => {
    if (!track?.audioUrl) return;
    // Same track tapped again → toggle.
    if (current?.id === track.id) {
      status.playing ? player.pause() : player.play();
      return;
    }
    const url = await signedUrl(track.audioUrl);
    if (!url) return;
    player.replace({ uri: url });
    player.play();
    setCurrent(track);
  }, [player, status.playing, current?.id]);

  const toggle = useCallback(() => {
    if (!current) return;
    status.playing ? player.pause() : player.play();
  }, [player, status.playing, current]);

  const stop = useCallback(() => {
    player.pause();
    setCurrent(null);
  }, [player]);

  const seek = useCallback((seconds) => {
    if (typeof player.seekTo === "function") player.seekTo(seconds);
  }, [player]);

  // Auto-clear the current track when playback finishes so the mini-player
  // hides itself instead of sitting there at 00:00.
  useEffect(() => {
    if (status.didJustFinish) setCurrent(null);
  }, [status.didJustFinish]);

  const value = useMemo(() => ({
    current,
    playing: !!status.playing,
    position: status.currentTime ?? 0,
    duration: status.duration ?? 0,
    play, toggle, stop, seek,
  }), [current, status.playing, status.currentTime, status.duration, play, toggle, stop, seek]);

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerCtx);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}
