// Tiny key/value store: SecureStore on native, localStorage on web.
// expo-secure-store has no web implementation, so importing it on web
// throws at runtime — branch on Platform.OS before touching it.
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

// Lazy-require SecureStore so the web bundle never tries to resolve it.
const SecureStore = isWeb ? null : require("expo-secure-store");

export async function getItem(key) {
  if (isWeb) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key, value) {
  if (isWeb) {
    try { globalThis.localStorage?.setItem(key, value); } catch {}
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key) {
  if (isWeb) {
    try { globalThis.localStorage?.removeItem(key); } catch {}
    return;
  }
  return SecureStore.deleteItemAsync(key);
}
