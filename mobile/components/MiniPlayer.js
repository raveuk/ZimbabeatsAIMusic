import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet, Platform } from "react-native";
import { usePlayer } from "../lib/PlayerContext";
import { getToken } from "../lib/api";
import { API_BASE } from "../config";
import { colors, space, radius, typography } from "../lib/theme";
import GradientCover from "./GradientCover";

// Sticky mini-player rendered above the tab bar. Hidden when nothing is playing.
// Tap the title area to open the track detail modal later — for now just shows
// the cover, title, play/pause, and a thin progress line at the very top.
export default function MiniPlayer({ onOpen }) {
  const { current, playing, position, duration, toggle, stop } = usePlayer();
  const [coverHref, setCoverHref] = useState(null);

  // Cover URL needs a signed token — same pattern as everywhere else.
  useEffect(() => {
    if (!current?.coverUrl) { setCoverHref(null); return; }
    let cancelled = false;
    getToken().then((tok) => {
      if (cancelled || !tok) return;
      const sep = current.coverUrl.includes("?") ? "&" : "?";
      setCoverHref(`${API_BASE}${current.coverUrl}${sep}token=${encodeURIComponent(tok)}`);
    });
    return () => { cancelled = true; };
  }, [current?.coverUrl]);

  if (!current) return null;

  const pct = duration > 0 ? Math.max(0, Math.min(100, (position / duration) * 100)) : 0;

  return (
    <View style={styles.wrap}>
      {/* Hairline progress sits flush against the top edge of the bar. */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>

      <View style={styles.row}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.tappable}
          onPress={() => onOpen?.(current)}
        >
          {coverHref
            ? <Image source={{ uri: coverHref }} style={styles.cover} />
            : <GradientCover track={current} style={styles.cover} showGlyph={false} />}
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>{current.title || `Track #${current.id}`}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {fmt(position)} / {fmt(duration)}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconBtn} onPress={toggle}>
          <Text style={styles.icon}>{playing ? "⏸" : "▶"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={stop}>
          <Text style={styles.iconSmall}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function fmt(s) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    // soft glow above the player so it feels lifted off the tab bar
    ...(Platform.OS === "web" ? { boxShadow: "0 -8px 24px rgba(0,0,0,0.4)" } : {}),
  },
  progressTrack: { height: 2, backgroundColor: colors.surface3 },
  progressFill: { height: "100%", backgroundColor: colors.accent },
  row: { flexDirection: "row", alignItems: "center", padding: space.sm, gap: space.sm },
  tappable: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md },
  cover: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  coverPh: { opacity: 0.4 },
  meta: { flex: 1, minWidth: 0 },
  title: { ...typography.body, color: colors.text, fontWeight: "600" },
  sub: { ...typography.caption, color: colors.textFade, marginTop: 2 },
  iconBtn: {
    width: 38, height: 38, borderRadius: radius.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.accent,
  },
  icon: { color: "#fff", fontSize: 16, fontWeight: "700" },
  iconSmall: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
