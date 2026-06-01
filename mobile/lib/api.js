// API client: thin fetch wrapper that talks to the Next.js backend.
// Auth is handled by Firebase — we just grab a fresh ID token from the SDK
// and send it as `Bearer <token>`. The backend verifies it with the Admin SDK
// and looks the user up in our SQLite by firebase_uid.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { Platform } from "react-native";
import { auth } from "./firebase";
import { API_BASE } from "../config";

// Get a fresh Firebase ID token. The SDK auto-refreshes when needed.
export async function getToken() {
  const user = auth.currentUser;
  if (!user) return null;
  try { return await user.getIdToken(); } catch { return null; }
}
// Kept for backwards-compat with screens that still call setToken(null) on
// logout — we just sign out of Firebase, the persistence layer clears itself.
export async function setToken(token) {
  if (!token) { try { await signOut(auth); } catch {} }
}

async function request(path, { method = "GET", body, sendAuth = true } = {}) {
  const headers = { "content-type": "application/json" };
  if (sendAuth) {
    const token = await getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Firebase-backed auth actions. They return the same shape as before
// ({ user, token }) so LoginScreen doesn't need to know which provider auth'd.
async function fbLogin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const token = await cred.user.getIdToken();
  const me = await request("/api/me");
  return { user: me.user, token };
}
async function fbRegister(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const token = await cred.user.getIdToken();
  const me = await request("/api/me");
  return { user: me.user, token };
}
async function fbForgot(email) {
  await sendPasswordResetEmail(auth, email);
  return { ok: true };
}
async function fbGoogle() {
  if (Platform.OS !== "web") throw new Error("Google sign-in is only available on the web build for now.");
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  const token = await cred.user.getIdToken();
  const me = await request("/api/me");
  return { user: me.user, token };
}

export const api = {
  register: fbRegister,
  login: fbLogin,
  forgot: fbForgot,
  google: fbGoogle,
  options: () => request("/api/options", { sendAuth: false }),
  voices: () => request("/api/voices", { sendAuth: false }),
  writeLyrics: (theme, language) => request("/api/lyrics", { method: "POST", body: { theme, language } }),
  generate: (params) => request("/api/generate", { method: "POST", body: params }),
  jobs: () => request("/api/jobs"),
  job: (id) => request(`/api/jobs/${id}`),
  deleteTrack: (id) => request(`/api/jobs/${id}`, { method: "DELETE" }),
  regenerateCover: (id) => request(`/api/jobs/${id}/cover`, { method: "POST" }),

  playlists: () => request("/api/playlists"),
  createPlaylist: (name) => request("/api/playlists", { method: "POST", body: { name } }),
  playlist: (id) => request(`/api/playlists/${id}`),
  deletePlaylist: (id) => request(`/api/playlists/${id}`, { method: "DELETE" }),
  addToPlaylist: (playlistId, trackId) =>
    request(`/api/playlists/${playlistId}/tracks`, { method: "POST", body: { trackId } }),
  removeFromPlaylist: (playlistId, trackId) =>
    request(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: "DELETE" }),

  // Auth introspection used on app launch.
  me: () => request("/api/me"),

  // Admin-only.
  adminUsers: () => request("/api/admin/users"),
  adminUpdateUser: (id, body) => request(`/api/admin/users/${id}`, { method: "PATCH", body }),
  adminDeleteUser: (id) => request(`/api/admin/users/${id}`, { method: "DELETE" }),
};

// Auth header value for streaming endpoints (expo-audio AudioSource headers).
export async function authHeader() {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
