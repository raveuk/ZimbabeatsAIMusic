import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, ScrollView } from "react-native";
import { api, setToken } from "../lib/api";
import { colors, space, radius, typography } from "../lib/theme";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";

const isWeb = Platform.OS === "web";

export default function LoginScreen({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function forgot() {
    if (!email) return Alert.alert("Enter your email", "Type your email above first, then tap Forgot password.");
    try {
      await api.forgot(email);
      Alert.alert("Check your email", "If that address has an account, we've sent a reset link.");
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
      Alert.alert("Google sign-in failed", e.message);
    } finally { setBusy(false); }
  }

  async function submit() {
    if (!email || !password) return Alert.alert("Missing", "Enter email and password.");
    setBusy(true);
    try {
      const res = mode === "login" ? await api.login(email, password) : await api.register(email, password);
      await setToken(res.token);
      onAuthed(res.user);
    } catch (e) {
      Alert.alert(mode === "login" ? "Login failed" : "Couldn't sign up", e.message);
    } finally { setBusy(false); }
  }

  return (
    <ScrollView contentContainerStyle={styles.outer}>
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          <View style={styles.logoOrb} />
          <Text style={styles.brand}>AiMusic</Text>
          <Text style={styles.tagline}>
            {mode === "login" ? "Welcome back. Sign in to keep creating." : "Create your account — make music in seconds."}
          </Text>
        </View>

        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
        />

        <Button
          label={mode === "login" ? "Log in" : "Sign up"}
          onPress={submit}
          busy={busy}
          style={{ marginTop: space.sm }}
        />

        {isWeb && (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
            <Button
              label="Continue with Google"
              onPress={google}
              busy={busy}
              variant="secondary"
            />
          </>
        )}

        {mode === "login" && (
          <TouchableOpacity onPress={forgot} style={styles.forgotBtn}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        <View style={styles.switchRow}>
          <Text style={styles.switchLead}>
            {mode === "login" ? "New here?" : "Already have an account?"}
          </Text>
          <TouchableOpacity onPress={() => setMode(mode === "login" ? "register" : "login")}>
            <Text style={styles.switchLink}>{mode === "login" ? "Sign up" : "Log in"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.credit}>Created by Rahim Manji  ·  © 2026</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
    paddingVertical: space.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  logoWrap: { alignItems: "center", marginBottom: space.xl },
  logoOrb: {
    width: 56, height: 56, borderRadius: radius.pill,
    backgroundColor: colors.accent,
    marginBottom: space.md,
    // simple radial glow effect on web
    boxShadow: "0 0 24px rgba(255, 106, 61, 0.5)",
  },
  brand: { ...typography.h2, color: colors.text, textAlign: "center" },
  tagline: { ...typography.meta, color: colors.textMute, textAlign: "center", marginTop: space.xs },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: space.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { ...typography.caption, color: colors.textFade, marginHorizontal: space.md, textTransform: "uppercase", letterSpacing: 1 },
  forgotBtn: { alignSelf: "center", paddingVertical: space.md },
  forgot: { ...typography.meta, color: colors.textMute },
  switchRow: { flexDirection: "row", justifyContent: "center", marginTop: space.lg, gap: space.xs },
  switchLead: { ...typography.meta, color: colors.textFade },
  switchLink: { ...typography.meta, color: colors.accent, fontWeight: "700" },
  credit: { ...typography.caption, color: colors.textFade, marginTop: space.xl, textAlign: "center" },
});
