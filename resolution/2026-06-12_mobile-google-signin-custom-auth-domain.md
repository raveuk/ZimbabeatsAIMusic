# Resolution — Mobile Google Sign-In Broken + "zimbabeats" Branding on Login

**Date:** 2026-06-12
**Reported by:** user (on phone)
**Status:** Resolved
**Symptoms:**
1. On a phone, tapping **Sign in with Google** showed the Google account
   chooser, but after picking an account it bounced back **not signed in**.
   (Worked fine on desktop.)
2. The Google login screen said **"to continue to
   zimbabeats-music.firebaseapp.com"** instead of showing the Myuzika brand.

---

## 1. Plain-English explanation of the problem

Both symptoms had **one root cause**: the app and the login system were on
**two different web addresses**.

- The app lives at **myuzika.com** (hosted on Cloudflare Pages).
- Firebase (the login system) was using **zimbabeats-music.firebaseapp.com**
  as its "auth domain" — the address that actually handles the Google login
  handshake.

Two consequences:

**a) The branding.** Google's login screen always shows whatever the auth
domain is. Because it was `zimbabeats-music.firebaseapp.com`, that's what
users saw.

**b) The mobile failure (the important one).** On phones, Firebase can't use a
pop-up window (phones block them), so it uses a **full-page redirect** instead.
During that redirect, the login handler at `firebaseapp.com` needs to set a
small cookie and read it back when you return to `myuzika.com`. But because
`firebaseapp.com` and `myuzika.com` are **different domains**, that cookie is a
"third-party cookie" — and **mobile Chrome blocks third-party cookies**. So the
login never completed: you'd pick your account, get sent back, and the app
would have no idea you'd just logged in.

Desktop worked because it used the pop-up method (which doesn't rely on those
cookies). Phones can't.

---

## 2. The fix (in one sentence)

Give Firebase a login address on **our own domain** — `auth.myuzika.com` —
so the cookie is **first-party** (same registrable domain as `myuzika.com`)
and mobile Chrome stops blocking it. This also makes the login screen show
our domain instead of "zimbabeats".

`auth.myuzika.com` and `myuzika.com` share the same root domain (`myuzika.com`),
so cookies between them are treated as first-party — that's the whole trick.

**Nothing about the main site changed.** `myuzika.com` still runs on Cloudflare
Pages exactly as before. `auth.myuzika.com` is just a small new subdomain that
serves Firebase's login handler.

---

## 3. Step-by-step — exactly what was done (anyone can follow this)

### Step A — Turn on Firebase Hosting (one-time)

Custom login domains require Firebase Hosting to be active. It wasn't, so the
"Add custom domain" button didn't exist yet.

- This was done **from the server's terminal** using the project's existing
  service-account credentials, so no manual CLI login was needed:
  ```bash
  # In a temp folder with a tiny placeholder site:
  #   public/index.html  (one-line placeholder page)
  #   firebase.json      ({ "hosting": { "public": "public" } })
  #   .firebaserc        ({ "projects": { "default": "zimbabeats-music" } })
  GOOGLE_APPLICATION_CREDENTIALS=server/data/firebase-admin.json \
    npx -y firebase-tools deploy --only hosting \
    --project zimbabeats-music --non-interactive
  ```
- Result: Firebase Hosting became active; the site went live at
  `https://zimbabeats-music.web.app`. (This placeholder page is harmless — no
  real users visit `.web.app`; the real app stays on Cloudflare.)
- **Note:** Deploying Hosting did NOT break the existing
  `firebaseapp.com/__/auth/handler` — that handler is provided automatically
  by Firebase Authentication, separate from Hosting.

### Step B — Add the custom domain in Firebase Console

1. Firebase Console → project **zimbabeats-music** → **Build → Hosting**
   (direct link: `https://console.firebase.google.com/project/zimbabeats-music/hosting/sites`)
2. Click **Add custom domain**.
3. Enter **`auth.myuzika.com`** → Continue.
4. Firebase showed a **CNAME record** to add for verification:
   - Type: `CNAME`
   - Name: `auth.myuzika.com`
   - Value: `zimbabeats-music.web.app`

   (Firebase's newer flow uses a single CNAME for both verification and
   serving. Older flows give a TXT record + two A records instead — either is
   fine, just add whatever Firebase shows.)

### Step C — Add the DNS record in Cloudflare

1. Cloudflare dashboard → select **myuzika.com** → **DNS → Records** →
   **Add record**.
2. Fill in:
   - **Type:** `CNAME`
   - **Name:** `auth`  (Cloudflare turns this into `auth.myuzika.com`)
   - **Target:** `zimbabeats-music.web.app`
3. **CRITICAL — Proxy status = "DNS only" (grey cloud), NOT "Proxied"
   (orange cloud).**
   - Why: Cloudflare's orange-cloud proxy intercepts SSL/TLS. Firebase needs to
     reach the domain directly to verify it and issue its own SSL certificate.
     With the orange cloud on, Firebase can never finish and the domain stays
     stuck "pending" forever. **This is the #1 thing people get wrong.**
4. Save.

### Step D — Wait for Firebase to verify + issue SSL

- Firebase verifies the CNAME (minutes), then provisions an SSL certificate
  for `auth.myuzika.com` (usually under an hour, up to 24h in rare cases).
- When done, the Firebase Hosting page shows the domain as **"Connected"**
  (green).
- How we confirmed from the terminal it was truly ready:
  ```bash
  curl -s -o /dev/null -w "%{http_code} ssl:%{ssl_verify_result}\n" \
    https://auth.myuzika.com/__/auth/handler
  # Ready when:  HTTP 200  and  ssl:0   (0 = valid certificate)
  # Not ready:   HTTP 000  /  ssl:1     (cert still provisioning — keep waiting)
  ```
  We also checked the page actually contained Firebase's handler code
  (the words `firebase` / `initialize`), not just an error page.

### Step E — Authorize the domain in Firebase Auth

- Firebase Console → **Authentication → Settings → Authorized domains** →
  **Add domain** → `auth.myuzika.com`.
- (This is a separate allow-list from Hosting. Necessary, but on its own it
  does nothing — it just permits the domain to be used for auth.)

### Step F — Point the app's code at the new domain

- File: `web/services/firebase.ts`
- Changed:
  ```diff
  - authDomain: 'zimbabeats-music.firebaseapp.com',
  + authDomain: 'auth.myuzika.com',
  ```
- Committed and pushed → Cloudflare Pages auto-deployed the change.
- Commit: `ca0d02e` ("Auth: switch authDomain to custom auth.myuzika.com").

### Step G — (If needed) authorize the redirect URI in Google Cloud

With a custom auth domain, Google's OAuth must trust the new handler URL. If
sign-in shows **"redirect_uri_mismatch" / Error 400**:

1. Google Cloud Console → **APIs & Services → Credentials**
   (`https://console.cloud.google.com/apis/credentials?project=zimbabeats-music`)
2. Open the **Web client** (auto-created by Firebase).
3. Under **Authorized redirect URIs**, ensure this is present:
   ```
   https://auth.myuzika.com/__/auth/handler
   ```
4. Add it if missing → Save → wait a few minutes.

(Firebase sometimes adds this automatically; check it only if you get the
mismatch error.)

---

## 4. How to verify it's fixed

On a phone (hard-refresh `myuzika.com` first to drop the old cached version):

1. Tap **Sign in with Google**.
2. The Google screen should now say **"to continue to auth.myuzika.com"**
   (branding fixed).
3. Pick an account → you should be **redirected back and actually signed in**
   (mobile cookies are now first-party, so the handoff completes).

---

## 5. Optional polish (not required for the fix)

- **App name on the consent screen:** to show the literal word **"Myuzika"**
  instead of the domain, set it in Google Cloud Console →
  **OAuth consent screen → App name**.
- **Email/password login** was always unaffected (it doesn't use redirects or
  third-party cookies) and works on mobile as a fallback.

---

## 6. The map (what points where, after the fix)

```
myuzika.com         -> Cloudflare Pages   (the whole app — unchanged)
auth.myuzika.com    -> Firebase Hosting   (CNAME -> zimbabeats-music.web.app)
                                           (serves the /__/auth/ login handler)
Firebase authDomain  = auth.myuzika.com    (set in web/services/firebase.ts)
```

---

## 7. Key lessons / gotchas (so this is reproducible)

1. **Mobile sign-in failing but desktop working = almost always a third-party
   cookie problem** caused by the auth domain differing from the app domain.
   Fix is a custom auth domain on the same root domain.
2. **The Cloudflare grey cloud (DNS only) on the auth CNAME is mandatory** —
   orange cloud silently blocks Firebase's SSL issuance forever.
3. **"Authorized domains" in Firebase Auth ≠ adding a custom domain.** The
   allow-list alone does nothing; you must also set up the Hosting custom
   domain + DNS.
4. **Firebase Hosting must be activated** (one deploy) before the
   "Add custom domain" button appears. This can be done non-interactively from
   a server using the service-account JSON — no `firebase login` needed.
5. **Confirm the cert is live before flipping the code** (`ssl_verify_result`
   must be `0`). Switching `authDomain` to a domain without a valid cert breaks
   sign-in entirely.
