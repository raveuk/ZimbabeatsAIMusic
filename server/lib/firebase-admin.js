// Firebase Admin SDK — verifies ID tokens minted by the mobile/web Firebase
// client and gives us back the user's UID + email. The service account JSON
// lives under server/data/ (gitignored, 0600) and is referenced by env var.
import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";

let cached = null;

function loadCredentials() {
  const rel = process.env.FIREBASE_ADMIN_CREDENTIALS || "data/firebase-admin.json";
  const p = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) {
    throw new Error(`Firebase service account not found at ${p}. Set FIREBASE_ADMIN_CREDENTIALS in .env.local.`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Initialize lazily so a missing/misconfigured key doesn't crash the entire
// process at import time — only routes that actually verify tokens will throw.
export function getAdmin() {
  if (cached) return cached;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(loadCredentials()) });
  }
  cached = admin;
  return admin;
}

// Verify an ID token. Returns { uid, email, email_verified, name } on success,
// null on any failure (expired, revoked, malformed, wrong project, …).
export async function verifyFirebaseIdToken(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const decoded = await getAdmin().auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: (decoded.email || "").toLowerCase(),
      emailVerified: !!decoded.email_verified,
      name: decoded.name || null,
    };
  } catch {
    return null;
  }
}
