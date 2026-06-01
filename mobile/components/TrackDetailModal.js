import { useEffect, useState } from "react";
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from "react-native";
import { getToken } from "../lib/api";
import { API_BASE } from "../config";

// Shows a track's cover, style, theme (if AI-written) and full lyrics.
export default function TrackDetailModal({ track, onClose }) {
  const p = track?.params || {};
  const lyrics = (p.lyrics || "").trim();
  const isInstrumental = !lyrics || lyrics.toLowerCase() === "[inst]";
  // Build the signed cover URL: append our JWT so the native <Image> loader
  // doesn't need to forward an Authorization header (which Android often drops).
  const [coverHref, setCoverHref] = useState(null);
  const [zoomOpen, setZoomOpen] = useState(false);
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

  // Close the zoom view whenever the parent modal closes, so reopening a
  // different track doesn't briefly flash the previous cover full-screen.
  useEffect(() => { if (!track) setZoomOpen(false); }, [track]);

  return (
    <Modal visible={!!track} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            {coverHref ? (
              <TouchableOpacity activeOpacity={0.85} onPress={() => setZoomOpen(true)}>
                <Image source={{ uri: coverHref }} style={styles.cover} />
              </TouchableOpacity>
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder]} />
            )}
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={2}>{track?.title || `Track #${track?.id}`}</Text>
              {p.style ? <Text style={styles.style} numberOfLines={3}>{p.style}</Text> : null}
              {p.writeLyrics && p.theme ? <Text style={styles.theme} numberOfLines={1}>✨ {p.theme}</Text> : null}
              {p.voiceModel ? <Text style={styles.theme} numberOfLines={1}>🎤 {String(p.voiceModel).replace(/\.pth$/i, "")}</Text> : null}
            </View>
          </View>

          <View style={styles.divider} />
          <ScrollView style={styles.lyricsScroll} contentContainerStyle={styles.lyricsContent}>
            <Text style={styles.lyrics}>{isInstrumental ? "🎷 Instrumental — no lyrics" : lyrics}</Text>
          </ScrollView>

          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Full-screen cover viewer — absolutely-positioned overlay inside the
          existing Modal. Nested <Modal> is flaky on Android/web, so we just
          paint over the parent sheet instead. Tap anywhere to dismiss. */}
      {zoomOpen && coverHref ? (
        <TouchableOpacity
          activeOpacity={1}
          style={styles.zoomBackdrop}
          onPress={() => setZoomOpen(false)}
        >
          <Image source={{ uri: coverHref }} style={styles.zoomImage} resizeMode="contain" />
        </TouchableOpacity>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#16161f", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, height: "92%" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  headerText: { flex: 1, minWidth: 0 },
  cover: { width: 96, height: 96, borderRadius: 10, backgroundColor: "#2a2a38" },
  coverPlaceholder: { opacity: 0.4 },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  style: { color: "#aaa", fontSize: 13, marginTop: 4 },
  theme: { color: "#8a7cff", fontSize: 12, marginTop: 4, fontStyle: "italic" },
  divider: { height: 1, backgroundColor: "#262631", marginVertical: 12 },
  lyricsScroll: { flex: 1 },
  lyricsContent: { paddingBottom: 16 },
  lyrics: { color: "#ddd", fontSize: 15, lineHeight: 22 },
  closeBtn: { paddingVertical: 14, alignItems: "center", marginTop: 12 },
  closeText: { color: "#8a7cff", fontSize: 16, fontWeight: "600" },
  zoomBackdrop: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  zoomImage: { width: "100%", height: "100%" },
});
