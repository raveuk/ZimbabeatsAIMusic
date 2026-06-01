import { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { usePlayer } from "../lib/PlayerContext";
import { getToken } from "../lib/api";
import { API_BASE } from "../config";
import { colors, space, radius, typography } from "../lib/theme";

// Single track tile for the Library grid. Big square cover, status overlay
// while generating, hover/press play button bottom-right. Designed to be
// rendered inside a 2-column FlatList.
export default function TrackCard({ track, onPress, renderActions }) {
  const player = usePlayer();
  const [coverHref, setCoverHref] = useState(null);

  useEffect(() => {
    if (!track?.coverUrl) { setCoverHref(null); return; }
    let cancelled = false;
    getToken().then((tok) => {
      if (cancelled || !tok) return;
      const sep = track.coverUrl.includes("?") ? "&" : "?";
      setCoverHref(`${API_BASE}${track.coverUrl}${sep}token=${encodeURIComponent(tok)}`);
    });
    return () => { cancelled = true; };
  }, [track?.coverUrl]);

  const isPlaying = player.current?.id === track.id && player.playing;
  const done = track.status === "done";
  const generating = track.status === "queued" || track.status === "running";
  const errored = track.status === "error";
  const pct = track.progress?.percent;

  async function handlePlay(e) {
    e?.stopPropagation?.();
    if (done) await player.play(track);
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.85} onPress={() => onPress?.(track)} style={styles.coverWrap}>
        {coverHref
          ? <Image source={{ uri: coverHref }} style={styles.cover} />
          : (
            <View style={[styles.cover, styles.coverPh]}>
              <Text style={styles.coverPhIcon}>🎵</Text>
            </View>
          )}

        {/* Status pill in top-left while generating / on error. */}
        {generating || errored ? (
          <View style={[styles.statusPill, errored && styles.statusErr]}>
            <Text style={styles.statusText}>{errored ? "Failed" : pct != null ? `${pct}%` : "Generating…"}</Text>
          </View>
        ) : null}

        {/* Play button anchored bottom-right of the cover (only when ready). */}
        {done && (
          <TouchableOpacity activeOpacity={0.8} onPress={handlePlay} style={styles.playBtn}>
            <Text style={styles.playIcon}>{isPlaying ? "⏸" : "▶"}</Text>
          </TouchableOpacity>
        )}
        {!done && generating && (
          <View style={styles.playBtnGhost}><ActivityIndicator color={colors.text} /></View>
        )}
      </TouchableOpacity>

      <TouchableOpacity activeOpacity={0.6} onPress={() => onPress?.(track)}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title || `Track #${track.id}`}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {track.params?.style || track.params?.theme || track.params?.lyrics?.slice(0, 80) || "—"}
        </Text>
      </TouchableOpacity>

      {renderActions ? <View style={styles.actions}>{renderActions(track)}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, marginBottom: space.lg },
  coverWrap: {
    position: "relative",
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface2,
    ...(Platform.OS === "web" ? { boxShadow: "0 8px 24px rgba(0,0,0,0.4)" } : {}),
  },
  cover: { width: "100%", height: "100%", borderRadius: radius.lg },
  coverPh: { alignItems: "center", justifyContent: "center" },
  coverPhIcon: { fontSize: 38, opacity: 0.3 },

  statusPill: {
    position: "absolute", top: space.sm, left: space.sm,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: space.sm, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusErr: { backgroundColor: "rgba(239, 68, 68, 0.85)" },
  statusText: { ...typography.caption, color: "#fff", fontWeight: "700" },

  playBtn: {
    position: "absolute", bottom: space.sm, right: space.sm,
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
    ...(Platform.OS === "web" ? { boxShadow: "0 6px 16px rgba(255, 106, 61, 0.5)" } : {}),
  },
  playIcon: { color: "#fff", fontSize: 18, fontWeight: "700" },
  playBtnGhost: {
    position: "absolute", bottom: space.sm, right: space.sm,
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
  },

  title: { ...typography.body, color: colors.text, fontWeight: "700", marginTop: space.md },
  sub:   { ...typography.caption, color: colors.textMute, marginTop: 2 },
  actions: { flexDirection: "row", marginTop: space.xs, marginLeft: -space.xxs },
});
