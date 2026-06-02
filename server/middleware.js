// CORS for the API. The Expo Web app at app.zimbabeats.com makes cross-origin
// requests to api.zimbabeats.com — without these headers the browser blocks them.
// Native Expo (iOS/Android) ignores CORS entirely, so this is purely for web.
import { NextResponse } from "next/server";

// Origins allowed to call the API. Localhost is for `expo start --web` dev
// and the Vite dev server (port 3000/5173). *.pages.dev covers every
// Cloudflare Pages deploy (prod + preview branches).
const ALLOWED = new Set([
  "https://myuzika.com",
  "https://www.myuzika.com",
  "https://app.zimbabeats.com",
  "https://zimbabeats.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:19006",
]);
const ALLOWED_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.pages\.dev$/i,
  // Any localhost port — Vite picks whatever's free (3000, 3001, 5173, …),
  // and pinning to specific ports broke Google sign-in when 3000 was already
  // occupied and Vite landed on 3001.
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED.has(origin)) return true;
  return ALLOWED_PATTERNS.some((re) => re.test(origin));
}

function corsHeaders(origin) {
  const h = new Headers();
  if (isAllowedOrigin(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
    h.set("Access-Control-Allow-Credentials", "true");
    h.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    h.set("Access-Control-Allow-Headers", "authorization, content-type");
    h.set("Access-Control-Max-Age", "86400");
  }
  return h;
}

export function middleware(req) {
  const origin = req.headers.get("origin");
  // Preflight short-circuit: return 204 with the CORS headers, no body.
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }
  // Real requests pass through; we just append the CORS headers on the way out.
  const res = NextResponse.next();
  const ch = corsHeaders(origin);
  ch.forEach((v, k) => res.headers.set(k, v));
  return res;
}

export const config = { matcher: "/api/:path*" };
