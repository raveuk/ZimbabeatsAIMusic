import { useCallback, useEffect, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert,
  Modal, TextInput, ActivityIndicator,
} from "react-native";
import { api } from "../lib/api";

// Admin panel: list every user, change their role, set a new password, delete.
// Visible only when the logged-in user's role === 'admin' (gated in App.js).
export default function AdminScreen({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pwTarget, setPwTarget] = useState(null);     // user we're setting a new password for
  const [pwValue, setPwValue] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [qTarget, setQTarget] = useState(null);       // user we're setting a track quota for
  const [qValue, setQValue] = useState("");
  const [qBusy, setQBusy] = useState(false);

  const load = useCallback(async () => {
    try { const { users } = await api.adminUsers(); setUsers(users); }
    catch (e) { Alert.alert("Failed to load", e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleDisabled(u) {
    if (u.id === currentUser.id) return Alert.alert("Can't disable yourself", "");
    const next = !u.disabled;
    Alert.alert(
      next ? "Disable account?" : "Re-enable account?",
      next
        ? `"${u.email}" won't be able to log in or use the app until you re-enable them.`
        : `"${u.email}" will be able to log in again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: next ? "Disable" : "Enable",
          style: next ? "destructive" : "default",
          onPress: async () => {
            try { await api.adminUpdateUser(u.id, { disabled: next }); load(); }
            catch (e) { Alert.alert("Failed", e.message); }
          },
        },
      ],
    );
  }

  async function saveQuota() {
    setQBusy(true);
    try {
      // empty input → unlimited (null)
      const trimmed = qValue.trim();
      const trackQuota = trimmed === "" ? null : Number(trimmed);
      if (trackQuota != null && (!Number.isInteger(trackQuota) || trackQuota < 0)) {
        Alert.alert("Invalid", "Enter a whole number, or leave blank for unlimited.");
        return;
      }
      await api.adminUpdateUser(qTarget.id, { trackQuota });
      setQTarget(null); setQValue("");
      load();
    } catch (e) { Alert.alert("Failed", e.message); }
    finally { setQBusy(false); }
  }

  async function toggleRole(u) {
    const newRole = u.role === "admin" ? "user" : "admin";
    if (newRole === "user" && u.id === currentUser.id) {
      return Alert.alert("Can't demote yourself", "Promote a different admin first.");
    }
    try {
      await api.adminUpdateUser(u.id, { role: newRole });
      load();
    } catch (e) { Alert.alert("Failed", e.message); }
  }

  function confirmDelete(u) {
    if (u.id === currentUser.id) return Alert.alert("Can't delete yourself", "");
    Alert.alert(
      "Delete user?",
      `"${u.email}" and ALL their tracks (${u.track_count}), playlists and files will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try { await api.adminDeleteUser(u.id); load(); }
            catch (e) { Alert.alert("Failed", e.message); }
          },
        },
      ]
    );
  }

  async function savePassword() {
    if (pwValue.length < 6) return Alert.alert("Too short", "Min 6 characters.");
    setPwBusy(true);
    try {
      await api.adminUpdateUser(pwTarget.id, { password: pwValue });
      setPwTarget(null);
      setPwValue("");
      Alert.alert("Password updated", `"${pwTarget.email}" has a new password.`);
    } catch (e) { Alert.alert("Failed", e.message); }
    finally { setPwBusy(false); }
  }

  function renderItem({ item }) {
    const self = item.id === currentUser.id;
    const quotaLabel = item.track_quota == null
      ? `${item.track_count} track${item.track_count === 1 ? "" : "s"} · unlimited`
      : `${item.track_count} / ${item.track_quota} tracks`;
    return (
      <View style={[styles.card, item.disabled && styles.cardDisabled]}>
        <View style={{ flex: 1 }}>
          <View style={styles.row}>
            <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
            {item.role === "admin" && <Text style={styles.badge}>admin</Text>}
            {item.disabled && <Text style={[styles.badge, styles.badgeDisabled]}>disabled</Text>}
            {self && <Text style={[styles.badge, styles.badgeSelf]}>you</Text>}
          </View>
          <Text style={styles.meta}>{quotaLabel}  ·  joined {String(item.created_at).slice(0, 10)}</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => { setPwTarget(item); setPwValue(""); }}>
            <Text style={styles.icon}>🔑</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => { setQTarget(item); setQValue(item.track_quota == null ? "" : String(item.track_quota)); }}>
            <Text style={styles.icon}>🎯</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => toggleRole(item)} disabled={self && item.role === "admin"}>
            <Text style={[styles.icon, self && item.role === "admin" && { opacity: 0.3 }]}>
              {item.role === "admin" ? "⬇" : "⬆"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => toggleDisabled(item)} disabled={self}>
            <Text style={[styles.icon, self && { opacity: 0.3 }]}>{item.disabled ? "✅" : "🚫"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => confirmDelete(item)} disabled={self}>
            <Text style={[styles.icon, self && { opacity: 0.3 }]}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={{ padding: 16 }}
        data={loading ? [] : users}
        keyExtractor={(u) => String(u.id)}
        ListHeaderComponent={
          <View>
            <Text style={styles.h1}>Admin</Text>
            <Text style={styles.subtitle}>🔑 reset password   🎯 track limit   ⬆/⬇ role   🚫/✅ disable   🗑️ delete</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>{loading ? "Loading…" : "No users."}</Text>}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            tintColor="#8a7cff"
          />
        }
      />

      <Modal visible={!!qTarget} transparent animationType="fade" onRequestClose={() => setQTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Track limit</Text>
            <Text style={styles.modalSub}>{qTarget?.email}  ·  has {qTarget?.track_count} now</Text>
            <TextInput
              style={styles.modalInput}
              value={qValue}
              onChangeText={setQValue}
              placeholder="e.g. 50 — leave blank for unlimited"
              placeholderTextColor="#666"
              keyboardType="number-pad"
              autoFocus
            />
            <Text style={styles.modalHint}>The user can't generate new tracks once they reach this number. Delete an existing one frees a slot.</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
              <TouchableOpacity onPress={() => setQTarget(null)} style={[styles.modalBtn, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveQuota} disabled={qBusy} style={[styles.modalBtn, styles.modalBtnPrimary, { flex: 1 }]}>
                {qBusy ? <ActivityIndicator color="#fff" /> : <Text style={[styles.modalBtnText, { color: "#fff" }]}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!pwTarget} transparent animationType="fade" onRequestClose={() => setPwTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Set new password</Text>
            <Text style={styles.modalSub}>{pwTarget?.email}</Text>
            <TextInput
              style={styles.modalInput}
              value={pwValue}
              onChangeText={setPwValue}
              placeholder="new password (min 6 chars)"
              placeholderTextColor="#666"
              secureTextEntry
              autoFocus
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
              <TouchableOpacity onPress={() => setPwTarget(null)} style={[styles.modalBtn, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={savePassword} disabled={pwBusy} style={[styles.modalBtn, styles.modalBtnPrimary, { flex: 1 }]}>
                {pwBusy ? <ActivityIndicator color="#fff" /> : <Text style={[styles.modalBtnText, { color: "#fff" }]}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f14" },
  h1: { fontSize: 26, fontWeight: "700", color: "#fff" },
  subtitle: { color: "#666", fontSize: 12, marginTop: 4, marginBottom: 12 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#1c1c26", borderRadius: 14, padding: 16, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  email: { color: "#fff", fontSize: 15, fontWeight: "600", marginRight: 8 },
  badge: { color: "#8a7cff", fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: "#2a2540", marginRight: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  badgeSelf: { color: "#888", backgroundColor: "#2a2a38" },
  badgeDisabled: { color: "#ff6868", backgroundColor: "#3a1818" },
  cardDisabled: { opacity: 0.55 },
  meta: { color: "#777", fontSize: 12, marginTop: 6 },
  actions: { flexDirection: "row", alignItems: "center", marginLeft: 8 },
  iconBtn: { padding: 8, marginHorizontal: 2 },
  icon: { fontSize: 20 },
  empty: { color: "#666", textAlign: "center", marginTop: 40 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 28 },
  modalSheet: { backgroundColor: "#16161f", borderRadius: 16, padding: 20 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  modalSub: { color: "#888", marginTop: 4, fontSize: 13 },
  modalInput: { backgroundColor: "#1c1c26", color: "#fff", borderRadius: 12, padding: 14, marginTop: 16, fontSize: 15 },
  modalHint: { color: "#666", fontSize: 12, marginTop: 10, fontStyle: "italic" },
  modalBtn: { backgroundColor: "#22222d", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnPrimary: { backgroundColor: "#6d5cff" },
  modalBtnText: { color: "#aaa", fontSize: 15, fontWeight: "600" },
});
