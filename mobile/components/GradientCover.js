import { LinearGradient } from "expo-linear-gradient";
import { View, Text, StyleSheet } from "react-native";
import { radius } from "../lib/theme";

// Deterministic procedural cover when a track doesn't have a real SDXL one yet.
// Hash the track id + title into a hue, build a 3-stop gradient at varying
// angles. Same input -> same gradient, so a placeholder doesn't flicker between
// reloads. Pulls from a Spotify-ish "rich, dark" palette so it sits cleanly
// alongside real album art in the grid.
//
// Used as the fallback in TrackCard / TrackDetailModal / MiniPlayer.

const PALETTES = [
  ["#7c2d12", "#dc2626", "#fbbf24"], // ember
  ["#1e1b4b", "#7c3aed", "#ec4899"], // night/violet/pink
  ["#0f766e", "#10b981", "#a7f3d0"], // sea
  ["#312e81", "#3b82f6", "#67e8f9"], // ocean
  ["#581c87", "#a855f7", "#f0abfc"], // grape
  ["#7c2d12", "#ea580c", "#fed7aa"], // rust/orange
  ["#831843", "#db2777", "#fbcfe8"], // berry
  ["#155e75", "#06b6d4", "#a5f3fc"], // ice
  ["#365314", "#65a30d", "#d9f99d"], // moss
  ["#7c1d6f", "#be185d", "#fda4af"], // magenta sunset
];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function paletteFor(track) {
  const seed = String(track?.id ?? "") + (track?.title ?? "");
  const h = hash(seed);
  return PALETTES[h % PALETTES.length];
}

function angleFor(track) {
  const seed = String(track?.id ?? "") + "angle";
  const h = hash(seed);
  // map to 8 cardinal/diagonal directions for a clean look
  const angles = [
    { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } },
    { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
    { start: { x: 1, y: 0 }, end: { x: 0, y: 1 } },
    { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
    { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
    { start: { x: 1, y: 1 }, end: { x: 0, y: 0 } },
  ];
  return angles[h % angles.length];
}

// Pick a glyph for the cover based on the track id/title — pure decoration,
// just to give the gradient some personality.
const GLYPHS = ["♪", "♫", "♩", "♬", "𝄞", "▲", "◆", "✦", "❋", "✷"];
function glyphFor(track) {
  const h = hash(String(track?.id ?? "") + "glyph");
  return GLYPHS[h % GLYPHS.length];
}

export default function GradientCover({ track, style, showGlyph = true }) {
  const palette = paletteFor(track);
  const { start, end } = angleFor(track);
  return (
    <View style={[styles.outer, style]}>
      <LinearGradient
        colors={palette}
        start={start}
        end={end}
        style={StyleSheet.absoluteFill}
      />
      {showGlyph && <Text style={styles.glyph}>{glyphFor(track)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    overflow: "hidden",
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  glyph: {
    fontSize: 64,
    color: "rgba(255,255,255,0.55)",
    fontWeight: "300",
  },
});
