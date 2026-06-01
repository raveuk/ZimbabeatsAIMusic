import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert,
} from "react-native";
import TrackList, { actionStyles } from "../components/TrackList";
import { api } from "../lib/api";

export default function PlaylistsScreen() {
  const [openId, setOpenId] = useState(null);
  return openId == null ? (
    <PlaylistList onOpen={setOpenId} />
  ) : (
    <PlaylistDetail id={openId} onBack={() => setOpenId(null)} />
  );
}

function PlaylistList({ onOpen }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try { setPlaylists((await api.playlists()).playlists); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    try { await api.createPlaylist(name.trim()); setName(""); load(); }
    catch (e) { Alert.alert("Failed", e.message); }
  }

  function confirmDelete(pl) {
    Alert.alert("Delete playlist?", `"${pl.name}" will be removed (its tracks stay in your Library).`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        setPlaylists((ps) => ps.filter((p) => p.id !== pl.id));
        try { await api.deletePlaylist(pl.id); } catch (e) { Alert.alert("Failed", e.message); load(); }
      } },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Playlists</Text>
      <View style={styles.newRow}>
        <TextInput style={styles.input} placeholder="New playlist name" placeholderTextColor="#888" value={name} onChangeText={setName} />
        <TouchableOpacity style={styles.createBtn} onPress={create} disabled={!name.trim()}>
          <Text style={styles.createText}>Create</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color="#8a7cff" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(p) => String(p.id)}
          style={{ marginTop: 12 }}
          ListEmptyComponent={<Text style={styles.empty}>No playlists yet. Make one above, then add tracks from your Library.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => onOpen(item.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.count}>{item.trackCount} {item.trackCount === 1 ? "track" : "tracks"}</Text>
              </View>
              <TouchableOpacity style={actionStyles.iconBtn} onPress={() => confirmDelete(item)}>
                <Text style={actionStyles.icon}>🗑️</Text>
              </TouchableOpacity>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function PlaylistDetail({ id, onBack }) {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api.playlist(id)); } catch (e) { Alert.alert("Failed", e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  function removeTrack(track) {
    Alert.alert(
      "Delete track?",
      `"${track.title || `Track #${track.id}`}" and its audio file will be permanently deleted — it's removed from your Library and any other playlists too.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setData((d) => ({ ...d, tracks: d.tracks.filter((t) => t.id !== track.id) })); // optimistic
            try { await api.deleteTrack(track.id); } catch (e) { Alert.alert("Failed", e.message); load(); }
          },
        },
      ]
    );
  }

  const header = (
    <View>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ Playlists</Text></TouchableOpacity>
      <Text style={styles.h1}>{data?.playlist?.name || "Playlist"}</Text>
    </View>
  );

  if (!data) {
    return <View style={styles.container}><ActivityIndicator color="#8a7cff" style={{ marginTop: 40 }} /></View>;
  }

  return (
    <TrackList
      tracks={data.tracks}
      header={header}
      emptyText="This playlist is empty. Add tracks from your Library."
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      renderActions={(track) => (
        <TouchableOpacity style={actionStyles.iconBtn} onPress={() => removeTrack(track)}>
          <Text style={actionStyles.icon}>🗑️</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f14", padding: 16 },
  h1: { fontSize: 26, fontWeight: "700", color: "#fff", marginVertical: 8 },
  back: { color: "#8a7cff", fontSize: 15, marginTop: 4 },
  newRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  input: { flex: 1, backgroundColor: "#1c1c26", color: "#fff", borderRadius: 10, padding: 12 },
  createBtn: { backgroundColor: "#6d5cff", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  createText: { color: "#fff", fontWeight: "600" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#1c1c26", borderRadius: 14, padding: 16, marginBottom: 12 },
  name: { color: "#fff", fontSize: 16, fontWeight: "600" },
  count: { color: "#888", fontSize: 13, marginTop: 4 },
  chevron: { color: "#666", fontSize: 24, marginLeft: 4 },
  empty: { color: "#666", textAlign: "center", marginTop: 40, paddingHorizontal: 20 },
});
