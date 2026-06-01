import { useState, useEffect } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert,
} from "react-native";
import { api } from "../lib/api";

// Sheet for adding `trackId` to a playlist; can also create a new one inline.
export default function AddToPlaylistModal({ visible, trackId, onClose }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    api.playlists().then((r) => setPlaylists(r.playlists)).catch(() => {}).finally(() => setLoading(false));
  }, [visible]);

  async function add(playlistId) {
    setBusy(true);
    try {
      await api.addToPlaylist(playlistId, trackId);
      onClose(true);
    } catch (e) {
      Alert.alert("Failed", e.message);
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const { playlist } = await api.createPlaylist(newName.trim());
      await api.addToPlaylist(playlist.id, trackId);
      setNewName("");
      onClose(true);
    } catch (e) {
      Alert.alert("Failed", e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onClose(false)}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => onClose(false)}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1}>
          <Text style={styles.h2}>Add to playlist</Text>

          <View style={styles.newRow}>
            <TextInput
              style={styles.input}
              placeholder="New playlist name"
              placeholderTextColor="#888"
              value={newName}
              onChangeText={setNewName}
            />
            <TouchableOpacity style={styles.createBtn} onPress={createAndAdd} disabled={busy || !newName.trim()}>
              <Text style={styles.createText}>Create</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color="#8a7cff" style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(p) => String(p.id)}
              style={{ marginTop: 8 }}
              ListEmptyComponent={<Text style={styles.empty}>No playlists yet — create one above.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => add(item.id)} disabled={busy}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowCount}>{item.trackCount}</Text>
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity onPress={() => onClose(false)} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#16161f", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "70%" },
  h2: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 14 },
  newRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, backgroundColor: "#1c1c26", color: "#fff", borderRadius: 10, padding: 12 },
  createBtn: { backgroundColor: "#6d5cff", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  createText: { color: "#fff", fontWeight: "600" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#262631" },
  rowName: { color: "#fff", fontSize: 16 },
  rowCount: { color: "#777", fontSize: 14 },
  empty: { color: "#666", textAlign: "center", marginTop: 20 },
  cancel: { paddingVertical: 14, alignItems: "center", marginTop: 6 },
  cancelText: { color: "#8a7cff", fontSize: 15 },
});
