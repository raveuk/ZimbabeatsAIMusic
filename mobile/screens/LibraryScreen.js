import { useEffect, useState, useCallback } from "react";
import { Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import TrackGrid from "../components/TrackGrid";
import AddToPlaylistModal from "../components/AddToPlaylistModal";
import TrackDetailModal from "../components/TrackDetailModal";
import { api } from "../lib/api";
import { colors, space, radius, typography } from "../lib/theme";

export default function LibraryScreen() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addTarget, setAddTarget] = useState(null); // trackId for the add-to-playlist modal
  const [detailTrack, setDetailTrack] = useState(null); // track for the lyrics detail modal
  const [regenerating, setRegenerating] = useState(() => new Set()); // track ids awaiting a fresh cover

  const load = useCallback(async () => {
    try {
      const { tracks } = await api.jobs();
      setTracks(tracks);
    } catch {
      // keep last list on transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll while any track is still generating, while a cover regen is in flight,
  // or while the backend reports a cover is still pending (covers can finish
  // after audio, and after the app reloads we might miss the regen-set entry).
  useEffect(() => {
    const generating = tracks.some((t) => t.status === "queued" || t.status === "running");
    const coverPending = tracks.some((t) => t.coverPending);
    if (!generating && !coverPending && regenerating.size === 0) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [tracks, load, regenerating]);

  // When a cover comes back, remove the track from the regenerating set.
  useEffect(() => {
    if (regenerating.size === 0) return;
    setRegenerating((prev) => {
      const next = new Set(prev);
      for (const t of tracks) if (next.has(t.id) && t.coverUrl) next.delete(t.id);
      return next.size === prev.size ? prev : next;
    });
  }, [tracks]); // eslint-disable-line react-hooks/exhaustive-deps

  function regenerateCover(track) {
    Alert.alert("New cover?", "Replace this track's cover with a freshly generated one (~15s).", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Replace",
        onPress: async () => {
          // Optimistic: clear the coverUrl so the placeholder shows while we wait,
          // and add the track to the polling set so we re-fetch every 5s until done.
          setTracks((ts) => ts.map((t) => (t.id === track.id ? { ...t, coverUrl: null } : t)));
          setRegenerating((prev) => new Set(prev).add(track.id));
          try { await api.regenerateCover(track.id); load(); }
          catch (e) {
            setRegenerating((prev) => { const n = new Set(prev); n.delete(track.id); return n; });
            Alert.alert("Failed", e.message); load();
          }
        },
      },
    ]);
  }

  function confirmDelete(track) {
    Alert.alert("Delete track?", `"${track.title || `Track #${track.id}`}" and its audio file will be permanently deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setTracks((ts) => ts.filter((t) => t.id !== track.id)); // optimistic
          try { await api.deleteTrack(track.id); } catch (e) { Alert.alert("Failed", e.message); load(); }
        },
      },
    ]);
  }

  function renderActions(track) {
    if (track.status !== "done") return null;
    return (
      <>
        <TouchableOpacity style={styles.actionBtn} onPress={() => regenerateCover(track)}>
          <Text style={styles.actionIcon}>🎨</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setAddTarget(track.id)}>
          <Text style={styles.actionIcon}>➕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(track)}>
          <Text style={styles.actionIcon}>🗑️</Text>
        </TouchableOpacity>
      </>
    );
  }

  return (
    <>
      <TrackGrid
        tracks={loading ? [] : tracks}
        header="Library"
        emptyText={loading ? "Loading…" : "No tracks yet — head to Create."}
        refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
        renderActions={renderActions}
        onPressItem={setDetailTrack}
      />
      <AddToPlaylistModal
        visible={addTarget != null}
        trackId={addTarget}
        onClose={(added) => { setAddTarget(null); if (added) Alert.alert("Added", "Track added to playlist."); }}
      />
      <TrackDetailModal track={detailTrack} onClose={() => setDetailTrack(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  actionBtn: { paddingHorizontal: space.xs, paddingVertical: space.xxs },
  actionIcon: { fontSize: 16 },
});
