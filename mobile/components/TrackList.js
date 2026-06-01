import { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Alert, Platform, Image,
} from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { authHeader, getToken } from "../lib/api";
import { getItem, setItem } from "../lib/storage";
import { API_BASE } from "../config";

const isWeb = Platform.OS === "web";
// Native-only modules — pulled in lazily so the web bundle never tries to resolve them.
const FileSystem = isWeb ? null : require("expo-file-system/legacy");
const Sharing    = isWeb ? null : require("expo-sharing");

// Append our JWT as ?token=… to a relative URL so RN <Image> can authenticate
// without relying on native loaders forwarding the Authorization header (they
// often don't on Android). Returns null if there's no token yet.
async function authedUrl(path) {
  if (!path) return null;
  const token = await getToken();
  if (!token) return null;
  return `${API_BASE}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

// SecureStore key for the Android download-folder URI granted via SAF.
const DOWNLOAD_DIR_KEY = "downloads_folder_uri";

// Strip characters that confuse mobile filesystems / share sheets.
const safeFile = (s) => String(s || "").replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "") || "track";

// Reusable list of tracks with inline playback. `renderActions(track)` lets each
// screen add its own row actions (delete, add-to-playlist, remove-from-playlist).
export default function TrackList({ tracks, refreshing, onRefresh, header, emptyText, renderActions, onPressItem }) {
  const [playingId, setPlayingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  // Map of trackId -> fully-built signed cover URL (with ?token=…).
  // Recomputed when item.coverUrl changes (regenerate gives a new ?v=…).
  const [coverUrls, setCoverUrls] = useState({});
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);

  function ensureCoverUrl(item) {
    const cur = coverUrls[item.id];
    // Re-fetch the signed URL whenever the relative URL changes (i.e. regen).
    if (item.coverUrl && (!cur || !cur.startsWith(`${API_BASE}${item.coverUrl}`.split("&token=")[0]))) {
      authedUrl(item.coverUrl).then((u) => u && setCoverUrls((prev) => ({ ...prev, [item.id]: u })));
    }
  }

  // First Android download asks once where to save; we remember the folder URI
  // and silently save every download there from then on. iOS has no Downloads
  // folder concept, so we fall back to the share sheet (the iOS-native pattern).
  async function getAndroidDownloadFolder() {
    const saved = await getItem(DOWNLOAD_DIR_KEY);
    if (saved) return saved;
    const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) throw new Error("Pick a folder once (e.g. Downloads) to save songs into.");
    await setItem(DOWNLOAD_DIR_KEY, perm.directoryUri);
    return perm.directoryUri;
  }

  async function download(track) {
    const name = `${safeFile(track.title || `track_${track.id}`)}.mp3`;
    setDownloadingId(track.id);
    try {
      if (isWeb) {
        // Browsers can't set Authorization on <a download>, so fetch the bytes
        // with the JWT header and hand a blob URL to a synthetic anchor.
        const headers = await authHeader();
        const res = await fetch(`${API_BASE}${track.audioUrl}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        return;
      }

      const tmp = `${FileSystem.cacheDirectory}${name}`;
      const headers = await authHeader();
      const res = await FileSystem.downloadAsync(`${API_BASE}${track.audioUrl}`, tmp, { headers });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);

      if (Platform.OS === "android") {
        const folderUri = await getAndroidDownloadFolder();
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(folderUri, name, "audio/mpeg");
        const b64 = await FileSystem.readAsStringAsync(res.uri, { encoding: FileSystem.EncodingType.Base64 });
        await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 });
        Alert.alert("Downloaded", `Saved as ${name}`);
      } else if (await Sharing.isAvailableAsync()) {
        // iOS — opens the Files-save sheet (the closest equivalent to a folder save).
        await Sharing.shareAsync(res.uri, { mimeType: "audio/mpeg", UTI: "public.mp3" });
      } else {
        Alert.alert("Downloaded", `Saved at ${res.uri}`);
      }
    } catch (e) {
      Alert.alert("Download failed", e.message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function play(track) {
    if (playingId === track.id) {
      status.playing ? player.pause() : player.play();
      return;
    }
    // Pass the JWT in the URL — Android's ExoPlayer is unreliable about
    // forwarding the Authorization header, which makes the audio endpoint
    // return a 401 JSON body that ExoPlayer then crashes trying to decode.
    const url = await authedUrl(track.audioUrl);
    if (!url) return;
    player.replace({ uri: url });
    player.play();
    setPlayingId(track.id);
  }

  function renderItem({ item }) {
    const isPlaying = playingId === item.id && status.playing;
    const done = item.status === "done";
    const generating = item.status === "queued" || item.status === "running";
    const pct = item.progress?.percent;
    // Kick off (or refresh) the signed cover URL for this row. Cheap no-op when nothing changed.
    if (item.coverUrl) ensureCoverUrl(item);
    const coverHref = item.coverUrl ? coverUrls[item.id] : null;
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          {coverHref ? (
            <Image source={{ uri: coverHref }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Text style={styles.coverPlaceholderIcon}>🎵</Text>
            </View>
          )}
          <TouchableOpacity style={{ flex: 1 }} disabled={!onPressItem} activeOpacity={0.6} onPress={() => onPressItem?.(item)}>
            <Text style={styles.title}>{item.title || `Track #${item.id}`}</Text>
            <Text style={styles.meta} numberOfLines={1}>{item.params.style || item.params.lyrics || "—"}</Text>
            <Text style={styles.status}>{statusLabel(item)}{onPressItem ? "  ·  tap for details" : ""}</Text>
          </TouchableOpacity>
          {renderActions && <View style={styles.actions}>{renderActions(item)}</View>}
          {done ? (
            <>
              <TouchableOpacity
                style={styles.downloadBtn}
                onPress={() => download(item)}
                disabled={downloadingId === item.id}
              >
                {downloadingId === item.id
                  ? <ActivityIndicator color="#8a7cff" />
                  : <Text style={styles.downloadIcon}>⬇️</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.playBtn} onPress={() => play(item)}>
                <Text style={styles.playIcon}>{isPlaying ? "⏸" : "▶"}</Text>
              </TouchableOpacity>
            </>
          ) : item.status === "error" ? (
            <Text style={styles.err}>⚠️</Text>
          ) : (
            <ActivityIndicator color="#8a7cff" />
          )}
        </View>
        {generating && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, pct != null ? { width: `${pct}%` } : styles.progressIndeterminate]} />
            </View>
            <Text style={styles.progressPct}>{pct != null ? `${pct}%` : "…"}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16 }}
      data={tracks}
      keyExtractor={(t) => String(t.id)}
      renderItem={renderItem}
      ListHeaderComponent={typeof header === "string" ? <Text style={styles.h1}>{header}</Text> : header}
      ListEmptyComponent={<Text style={styles.empty}>{emptyText || "Nothing here yet."}</Text>}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor="#8a7cff" /> : undefined
      }
    />
  );
}

export function statusLabel(t) {
  if (t.status === "done") return "Ready";
  if (t.status === "error") return "Failed";
  if (t.status === "queued") return t.queuePosition ? `Queued (#${t.queuePosition})` : "Queued";
  return "Generating…";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f14" },
  h1: { fontSize: 26, fontWeight: "700", color: "#fff", marginBottom: 12 },
  card: { backgroundColor: "#1c1c26", borderRadius: 14, padding: 16, marginBottom: 12 },
  cardRow: { flexDirection: "row", alignItems: "center" },
  cover: { width: 56, height: 56, borderRadius: 8, marginRight: 12, backgroundColor: "#2a2a38" },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  coverPlaceholderIcon: { fontSize: 22, opacity: 0.4 },
  progressWrap: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#2a2a38", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: "#8a7cff" },
  progressIndeterminate: { width: "15%", opacity: 0.5 },
  progressPct: { color: "#8a7cff", fontSize: 12, marginLeft: 10, width: 38, textAlign: "right" },
  title: { color: "#fff", fontSize: 16, fontWeight: "600" },
  meta: { color: "#888", fontSize: 13, marginTop: 4 },
  status: { color: "#8a7cff", fontSize: 12, marginTop: 6 },
  actions: { flexDirection: "row", alignItems: "center", marginRight: 6 },
  playBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#6d5cff", alignItems: "center", justifyContent: "center" },
  playIcon: { color: "#fff", fontSize: 20 },
  downloadBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 6 },
  downloadIcon: { fontSize: 20 },
  err: { fontSize: 22, marginRight: 6 },
  empty: { color: "#666", textAlign: "center", marginTop: 40 },
});

export const actionStyles = StyleSheet.create({
  iconBtn: { padding: 8, marginHorizontal: 2 },
  icon: { fontSize: 18 },
});
