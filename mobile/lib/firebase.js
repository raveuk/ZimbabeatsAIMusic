// Firebase client SDK — used for sign-up, sign-in, password reset, and
// session token retrieval. The values here are public (Firebase relies on
// security rules + the API key's auth-domain restriction, not on hiding them).
import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
  browserLocalPersistence,
  inMemoryPersistence,
} from "firebase/auth";
import { Platform } from "react-native";
import { getItem, setItem, deleteItem } from "./storage";

const firebaseConfig = {
  apiKey: "AIzaSyDtkKKVfk6GXixLy9V-z0GjHJgbUTtQYW8",
  authDomain: "zimbabeats-music.firebaseapp.com",
  projectId: "zimbabeats-music",
  storageBucket: "zimbabeats-music.firebasestorage.app",
  messagingSenderId: "739115993220",
  appId: "1:739115993220:web:a1c7f95822c5c336475ad1",
};

const app = initializeApp(firebaseConfig);

// Persistence: web uses localStorage, native wires a tiny adapter on top of
// our existing SecureStore-backed shim so the session survives app restarts.
const nativeAdapter = {
  getItem: (k) => getItem(k),
  setItem: (k, v) => setItem(k, v),
  removeItem: (k) => deleteItem(k),
};

export const auth = initializeAuth(app, {
  persistence:
    Platform.OS === "web"
      ? browserLocalPersistence
      : (typeof getReactNativePersistence === "function"
          ? getReactNativePersistence(nativeAdapter)
          : inMemoryPersistence),
});

export default app;
