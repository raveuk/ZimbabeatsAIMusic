// API client: token persistence + thin fetch wrapper around the backend.
import { getItem, setItem, deleteItem } from "./storage";
import { API_BASE } from "../config";

const TOKEN_KEY = "auth_token";

export async function getToken() {
  return getItem(TOKEN_KEY);
}
export async function setToken(token) {
  if (token) await setItem(TOKEN_KEY, token);
  else await deleteItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "content-type": "application/json" };
  if (auth) {
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

export const api = {
  register: (email, password) =>
    request("/api/auth/register", { method: "POST", auth: false, body: { email, password } }),
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", auth: false, body: { email, password } }),
  forgot: (email) =>
    request("/api/auth/forgot", { method: "POST", auth: false, body: { email } }),
  options: () => request("/api/options", { auth: false }),
  voices: () => request("/api/voices", { auth: false }),
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
