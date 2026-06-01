import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { getToken, setToken, api } from "./lib/api";
import LoginScreen from "./screens/LoginScreen";
import CreateScreen from "./screens/CreateScreen";
import LibraryScreen from "./screens/LibraryScreen";
import PlaylistsScreen from "./screens/PlaylistsScreen";
import AdminScreen from "./screens/AdminScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      {/* On web/desktop the RN layout stretches to the full viewport which
          looks awful for a phone-shaped app. Cap the UI at a phone-ish width
          and centre it; on native this wrapper is a transparent pass-through. */}
      <View style={styles.outer}>
        <View style={styles.shell}>
          <AppInner />
        </View>
      </View>
    </SafeAreaProvider>
  );
}

function AppInner() {
  const [user, setUser] = useState(null);            // { id, email, role } when authed
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState("create");

  // On launch, resolve the stored token to a user (with role) via /api/me.
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try { const { user } = await api.me(); setUser(user); }
        catch { await setToken(null); }
      }
      setChecking(false);
    })();
  }, []);

  async function logout() {
    await setToken(null);
    setUser(null);
    setTab("create");
  }

  if (checking) {
    return (
      <View style={[styles.fill, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color="#8a7cff" size="large" />
      </View>
    );
  }

  if (!user) {
    return (
      <>
        <StatusBar style="light" />
        <LoginScreen onAuthed={setUser} />
      </>
    );
  }

  const isAdmin = user.role === "admin";

  return (
    <SafeAreaView style={styles.fill}>
      <StatusBar style="light" />
      <View style={styles.topbar}>
        <Text style={styles.brand}>🎵 AI Music</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Log out</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "create" && <CreateScreen onCreated={() => setTab("library")} />}
        {tab === "library" && <LibraryScreen />}
        {tab === "playlists" && <PlaylistsScreen />}
        {tab === "admin" && isAdmin && <AdminScreen currentUser={user} />}
      </View>

      <View style={styles.tabbar}>
        <Tab label="Create" active={tab === "create"} onPress={() => setTab("create")} />
        <Tab label="Library" active={tab === "library"} onPress={() => setTab("library")} />
        <Tab label="Playlists" active={tab === "playlists"} onPress={() => setTab("playlists")} />
        {isAdmin && <Tab label="Admin" active={tab === "admin"} onPress={() => setTab("admin")} />}
      </View>
    </SafeAreaView>
  );
}

function Tab({ label, active, onPress }) {
  return (
    <TouchableOpacity style={styles.tab} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const isWeb = Platform.OS === "web";
const styles = StyleSheet.create({
  // Desktop frame: pure black gutter, app centred and capped.
  outer: {
    flex: 1,
    backgroundColor: isWeb ? "#000" : "#0a0a0f",
    alignItems: isWeb ? "center" : "stretch",
  },
  shell: {
    flex: 1,
    width: "100%",
    maxWidth: isWeb ? 480 : undefined,
    backgroundColor: "#0a0a0f",
  },
  fill: { flex: 1, backgroundColor: "#0a0a0f" },
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 },
  brand: { color: "#fafaff", fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
  logout: { color: "#a5a5b8", fontSize: 13 },
  tabbar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#262631", backgroundColor: "#0a0a0f" },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabText: { color: "#6b6b80", fontSize: 13, fontWeight: "600", letterSpacing: 0.3 },
  tabActive: { color: "#ff6a3d" },
});
