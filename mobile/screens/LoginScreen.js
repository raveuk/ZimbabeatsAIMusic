import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from "react-native";
import { api, setToken } from "../lib/api";

const isWeb = Platform.OS === "web";

export default function LoginScreen({ onAuthed }) {
  const [mode, setMode] = useState("login"); // or "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function forgot() {
    if (!email) return Alert.alert("Enter your email", "Type your email above first, then tap Forgot password.");
    try {
      await api.forgot(email);
      Alert.alert(
        "Check your email",
        "If that address has an account, we've sent a reset link. Open it on this Wi-Fi to set a new password."
      );
    } catch (e) {
      Alert.alert("Couldn't send", e.message);
    }
  }

  async function google() {
    setBusy(true);
    try {
      const res = await api.google();
      await setToken(res.token);
      onAuthed(res.user);
    } catch (e) {
      // popup-closed / popup-blocked / unauthorized-domain — show the message.
      Alert.alert("Google sign-in failed", e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!email || !password) return Alert.alert("Missing", "Enter email and password.");
    setBusy(true);
    try {
      const res = mode === "login" ? await api.login(email, password) : await api.register(email, password);
      await setToken(res.token);
      onAuthed(res.user); // passes { id, email, role } back to App.js
    } catch (e) {
      Alert.alert(mode === "login" ? "Login failed" : "Register failed", e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🎵 AI Music</Text>
      <Text style={styles.subtitle}>{mode === "login" ? "Welcome back" : "Create an account"}</Text>
      <TextInput
        style={styles.input}
        placeholder="email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholderTextColor="#888"
      />
      <TextInput
        style={styles.input}
        placeholder="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholderTextColor="#888"
      />
      <TouchableOpacity style={styles.button} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mode === "login" ? "Log in" : "Sign up"}</Text>}
      </TouchableOpacity>

      {isWeb && (
        <>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>
          <TouchableOpacity style={styles.googleBtn} onPress={google} disabled={busy}>
            <Text style={styles.googleText}>Continue with Google</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => setMode(mode === "login" ? "register" : "login")}>
        <Text style={styles.switch}>
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </Text>
      </TouchableOpacity>
      {mode === "login" && (
        <TouchableOpacity onPress={forgot}>
          <Text style={styles.forgot}>Forgot password?</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.credit}>Created by Rahim Manji</Text>
      <Text style={styles.copyright}>© 2026 — All rights reserved</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#0f0f14" },
  logo: { fontSize: 40, textAlign: "center", color: "#fff" },
  subtitle: { fontSize: 16, textAlign: "center", color: "#aaa", marginBottom: 28, marginTop: 8 },
  input: { backgroundColor: "#1c1c26", color: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: "#6d5cff", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  switch: { color: "#8a7cff", textAlign: "center", marginTop: 20 },
  forgot: { color: "#888", textAlign: "center", marginTop: 14, fontSize: 13 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginTop: 18, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#2a2a38" },
  dividerText: { color: "#666", marginHorizontal: 10, fontSize: 12 },
  googleBtn: { backgroundColor: "#fff", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 8 },
  googleText: { color: "#1f1f24", fontSize: 15, fontWeight: "600" },
  credit: { color: "#555", textAlign: "center", marginTop: 36, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  copyright: { color: "#444", textAlign: "center", marginTop: 4, fontSize: 11 },
});
