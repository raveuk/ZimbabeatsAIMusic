import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { getToken, setToken, api } from "./lib/api";
import { PlayerProvider } from "./lib/PlayerContext";
import MiniPlayer from "./components/MiniPlayer";
import LoginScreen from "./screens/LoginScreen";
import CreateScreen from "./screens/CreateScreen";
import LibraryScreen from "./screens/LibraryScreen";
import PlaylistsScreen from "./screens/PlaylistsScreen";
import AdminScreen from "./screens/AdminScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      {/* PlayerProvider must wrap the whole tree so the audio player keeps
          playing as the user switches tabs — it lives outside AppInner so it
          survives any logout-driven remount of the screens themselves. */}
      <PlayerProvider>
        {/* On web/desktop the RN layout stretches to the full viewport which
            looks awful for a phone-shaped app. Cap the UI at a phone-ish width
            and centre it; on native this wrapper is a transparent pass-through. */}
        <View style={styles.outer}>
          <View style={styles.shell}>
            <AppInner />
          </View>
        </View>
      </PlayerProvider>
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

  const navItems = [
    { key: "create",    label: "Create",    icon: "✨" },
    { key: "library",   label: "Library",   icon: "♪" },
    { key: "playlists", label: "Playlists", icon: "♬" },
    ...(isAdmin ? [{ key: "admin", label: "Admin", icon: "⚙" }] : []),
  ];

  const content = (
    <>
      {tab === "create" && <CreateScreen onCreated={() => setTab("library")} />}
      {tab === "library" && <LibraryScreen />}
      {tab === "playlists" && <PlaylistsScreen />}
      {tab === "admin" && isAdmin && <AdminScreen currentUser={user} />}
    </>
  );

  // Web layout: left sidebar + content + bottom player (no top bar, brand sits
  // at the top of the sidebar). Native layout: top bar + content + player +
  // bottom tab bar (better for thumb reach on phones).
  if (isWeb) {
    return (
      <SafeAreaView style={styles.fill}>
        <StatusBar style="light" />
        <View style={styles.webRow}>
          <View style={styles.sidebar}>
            <Text style={styles.brand}>Myuzika</Text>
            {navItems.map((n) => (
              <SidebarItem key={n.key} {...n} active={tab === n.key} onPress={() => setTab(n.key)} />
            ))}
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={logout} style={styles.sidebarLogout}>
              <Text style={styles.sidebarLogoutText}>Log out</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.webMain}>{content}</View>
        </View>
        <MiniPlayer />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.fill}>
      <StatusBar style="light" />
      <View style={styles.topbar}>
        <Text style={styles.brand}>Myuzika</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Log out</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>{content}</View>
      <MiniPlayer />
      <View style={styles.tabbar}>
        {navItems.map((n) => (
          <Tab key={n.key} label={n.label} active={tab === n.key} onPress={() => setTab(n.key)} />
        ))}
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

function SidebarItem({ label, icon, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.sideItem, active && styles.sideItemActive]} onPress={onPress}>
      <Text style={[styles.sideIcon, active && styles.sideIconActive]}>{icon}</Text>
      <Text style={[styles.sideLabel, active && styles.sideLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const isWeb = Platform.OS === "web";
const ACCENT = "#ff69b4";
const styles = StyleSheet.create({
  // Desktop frame: pure black gutter, sidebar layout caps at a desktop width.
  outer: {
    flex: 1,
    backgroundColor: isWeb ? "#000" : "#0a0a0f",
    alignItems: isWeb ? "center" : "stretch",
  },
  shell: {
    flex: 1,
    width: "100%",
    maxWidth: isWeb ? 1280 : undefined,
    backgroundColor: "#0a0a0f",
  },
  fill: { flex: 1, backgroundColor: "#0a0a0f" },

  // Native top bar
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 },
  brand: { color: "#fafaff", fontSize: 22, fontWeight: "800", letterSpacing: -0.2 },
  logout: { color: "#a5a5b8", fontSize: 13 },

  // Native bottom tab bar
  tabbar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#262631", backgroundColor: "#0a0a0f" },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabText: { color: "#6b6b80", fontSize: 13, fontWeight: "600", letterSpacing: 0.3 },
  tabActive: { color: ACCENT },

  // Web sidebar
  webRow: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: 220,
    paddingVertical: 24,
    paddingHorizontal: 14,
    backgroundColor: "#0a0a0f",
    borderRightWidth: 1,
    borderRightColor: "#262631",
  },
  webMain: { flex: 1, backgroundColor: "#0a0a0f" },

  sideItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  sideItemActive: { backgroundColor: "#1f1f29" },
  sideIcon: { color: "#a5a5b8", fontSize: 18, width: 22, textAlign: "center" },
  sideIconActive: { color: ACCENT },
  sideLabel: { color: "#a5a5b8", fontSize: 14, fontWeight: "600" },
  sideLabelActive: { color: "#fafaff" },

  sidebarLogout: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 12 },
  sidebarLogoutText: { color: "#6b6b80", fontSize: 13 },
});
