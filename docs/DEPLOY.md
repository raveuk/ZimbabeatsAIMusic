# Deploying Myuzika — manual GitHub → Cloudflare Pages workflow

This is the long-form, hand-hold-you-through-it guide for shipping a change
from your editor at `ubuntuai` to production at https://myuzika.com.

Every step shows you (a) the exact command, (b) the output you should expect,
(c) what to do if you see something different.

**The flow at a glance:**

| # | What | Why | Time |
|---|---|---|---|
| 0 | Verify prerequisites | One-time per machine | ~1 min |
| 1 | Start backend dev server | Boots `/api/*` | ~10 s |
| 2 | Start frontend dev server | Boots the React app | ~10 s |
| 3 | Click-test in private browser | Catch UX/logic bugs early | 2–10 min |
| 4 | Production build locally | Catch parse / type errors | ~15 s |
| 5 | `git status` & inspect diff | Confirm what you're shipping | ~30 s |
| 6 | Stage files with `git add` | Avoid committing experiments | ~30 s |
| 7 | `git diff --staged` | Last sanity check | ~30 s |
| 8 | `git commit` | Capture the *why* | ~1 min |
| 9 | `git push origin main` | Pre-push hook runs build | ~30 s |
| 10 | Watch Cloudflare Pages build | Make sure CI builds clean | 2–5 min |
| 11 | Verify live bundle hash changed | Confirm CDN propagated | ~15 s |
| 12 | Verify headers if you changed `_headers` | Catch config drift | ~15 s |
| 13 | Click-test in private browser on prod | Final smoke test | 2–10 min |
| 14 | Roll back if anything is broken | Recover in seconds | ~1 min |

**Total time for a clean deploy**: 10–15 min depending on how thorough your
click-test is.

There is an instinct, when something "looks done", to skip step 3 or step 13.
**Don't.** The memory note `no-premature-deploys` exists in this project
because past pushes hit production untested and the result was a broken site
with no rollback in sight. Push fast, but click first.

---

## Step 0 — Verify prerequisites (one-time per machine)

Run all of these and check the output. They should already pass on `ubuntuai`.

```bash
node --version
```

Expected output (or similar):

```
v20.18.0
```

If `command not found`, install Node first via `nvm` or your package manager.
Anything below v18 will fail Vite's build.

```bash
npm --version
```

Expected: any 10.x or 11.x version.

```bash
git --version
```

Expected: `git version 2.x.x`.

```bash
gh --version
```

Expected: `gh version 2.x.x (...)` and a homepage line.

If `gh: command not found`, install via:
```bash
sudo apt install gh
```

```bash
gh auth status
```

Expected:

```
github.com
  ✓ Logged in to github.com as raveuk (...)
  ✓ Git operations for github.com configured to use https protocol.
  ✓ Token: gho_************
```

If you see "You are not logged into any GitHub hosts", run:
```bash
gh auth login
```
…and follow the prompts (Account: GitHub.com → HTTPS → Login with browser).

```bash
cd /home/raveuk/comfy/music-app
git remote -v
```

Expected:

```
origin  https://github.com/raveuk/ZimbabeatsAIMusic.git (fetch)
origin  https://github.com/raveuk/ZimbabeatsAIMusic.git (push)
```

If the remote is missing or wrong, fix with `git remote set-url origin <url>`.

```bash
git branch --show-current
```

Expected: `main`. If you're on a feature branch, switch back to `main` and
merge your work in first — Cloudflare Pages only watches `main`.

---

## Step 1 — Start the backend dev server

Open **Terminal A**. The backend is a Next.js app under `server/` that serves
all `/api/*` routes.

```bash
cd /home/raveuk/comfy/music-app/server
npm run dev
```

Expected output, after ~5–10 seconds:

```
> server@0.1.0 dev
> next dev -H 0.0.0.0 -p 3000

   ▲ Next.js 14.x.x
   - Local:        http://localhost:3000
   - Network:      http://0.0.0.0:3000

 ✓ Ready in 4.2s
```

**Leave this terminal running.** Do not Ctrl+C until you're done deploying.

**Troubleshooting:**

| Symptom | Cause | Fix |
|---|---|---|
| `EADDRINUSE: address already in use :::3000` | A previous `npm run dev` is still running | `lsof -i :3000` to find the PID, `kill <PID>`. Or `pkill -f "next dev"` to wipe them all. |
| `Module not found: Can't resolve '...'` | New dep in `package.json` not yet installed | `npm install` then retry |
| `Cannot find module 'next'` | `node_modules` is missing or wrong Node version | `rm -rf node_modules package-lock.json && npm install` |
| Hangs at "starting"... for >60s | First-time Next.js compile or huge codebase | Wait. First start can be slow. |

Verify it's responding before moving on:

```bash
curl -s -o /dev/null -w "backend: HTTP %{http_code}\n" http://127.0.0.1:3000/
```

Expected: `backend: HTTP 200`.

---

## Step 2 — Start the frontend dev server

Open **Terminal B** (keep Terminal A running).

```bash
cd /home/raveuk/comfy/music-app/web
npm run dev
```

Expected output, after ~3–5 seconds:

```
  VITE v5.x.x  ready in 412 ms

  ➜  Local:   http://localhost:3001/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

**Leave this terminal running too.** Vite has hot-reload — when you edit a
file, the browser refreshes within ~200 ms. Stopping it kills HMR.

Verify:

```bash
curl -s -o /dev/null -w "frontend: HTTP %{http_code}\n" http://127.0.0.1:3001/
```

Expected: `frontend: HTTP 200`.

**Troubleshooting:**

| Symptom | Cause | Fix |
|---|---|---|
| `Port 3001 is in use, trying 3002 instead` | A prior Vite is still running | `pkill -f "vite"` and retry, or just use the new port |
| `Failed to fetch dynamically imported module` in browser | Vite cache corrupted | Stop Vite, `rm -rf node_modules/.vite`, restart |
| Browser shows white page, no error in console | Index template missing or broken | Check `web/index.html` is intact |

---

## Step 3 — Click-test in a private/incognito browser window

**This is the most important step. Do not skip it.**

Why private window: your normal browser already holds the Firebase session
cookie + your `localStorage`. Visiting `localhost:3001` from a logged-in
browser **skips the entire landing page and auth flow**, so you'd be testing
only the authenticated app. Most of the recent landing-page work is invisible
to a logged-in browser.

**Open a private window:**

- Firefox: **Ctrl+Shift+P**
- Chrome/Edge: **Ctrl+Shift+N**
- Safari: **Cmd+Shift+N**

Visit: **http://localhost:3001**

**Walk the unauthenticated flow:**

1. ✅ Landing page renders fully — hero, listen wall, feature cards, FAQ, footer.
2. ✅ Hover effects work on the listen-wall track cards.
3. ✅ Click a track in the listen wall — it plays inline. Click again — it pauses.
4. ✅ Click "Sign In" or "Sign Up" — the auth modal opens with × button visible.
5. ✅ Click the × — modal closes, you're back on the landing.
6. ✅ Open the modal again, click "Continue with Google" — the popup appears (or full-page redirect on mobile).
7. ✅ Complete Google sign-in.
8. ✅ Land in the authenticated app, see your songs.

**Walk the authenticated flow:**

9. ✅ Click **Library** in the sidebar — see your tracks.
10. ✅ Click **Create** — see the prompt panel.
11. ✅ Click **AI Video** — see the video panel.
12. ✅ Open **Settings** (sidebar avatar) — see language picker.
13. ✅ Open your profile — see your tracks, profile pic, stats.

**Check the DevTools Console:**

- Press **F12** to open DevTools, click the **Console** tab.
- The console should be quiet. A few yellow warnings are fine.
- **Red errors are not fine.** If you see one, copy the message and the file
  path. Either fix it now or note it down — do not proceed to a push.

**If a click-test fails:**

- Open the source file referenced in the console error.
- Fix it.
- Vite hot-reloads the browser automatically.
- Re-test the same flow.
- Repeat until clean.

If you can't reproduce a bug locally but think one exists in production, fix
it locally first with a test case. Production debugging is 10x harder than
local.

---

## Step 4 — Production build locally

Vite's dev server uses ES modules unbundled. It can run code that fails the
production bundler. Catching it here means you don't waste a CI cycle.

```bash
cd /home/raveuk/comfy/music-app/web
npm run build
```

Expected (after ~10–30 s):

```
> web@0.0.0 build
> vite build

vite v5.x.x building for production...
✓ NNN modules transformed.
dist/index.html                   X.XX kB │ gzip:   Y.YY kB
dist/assets/index-XXXXXXXX.js   XXX.XX kB │ gzip: ZZZ.ZZ kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in N.NNs
```

The 500 kB warning is **expected and normal** — ignore it. It just means our
bundle is large; doesn't affect correctness.

**What "passed" looks like:**
- The last line says `✓ built in`.
- No red `error` lines above it (yellow warnings OK).

**What "failed" looks like:**

```
error during build:
  Could not resolve "../components/Foo" from "src/App.tsx"
```

or:

```
src/App.tsx(123,4): error TS2322: Type 'string' is not assignable to type 'number'.
```

**Failed build means**:
1. Fix the error in your editor.
2. Re-run `npm run build`.
3. Repeat until clean.

You cannot push a build that fails locally — the pre-push hook will reject it
in step 9. So fix here, save yourself the round trip.

**Also build the server** (only if you changed `server/` files or `package.json`):

```bash
cd /home/raveuk/comfy/music-app/server
npm run build
```

Expected: `✓ Compiled successfully` then `Route (app) ...` listing all routes.

---

## Step 5 — `git status` & inspect what you're about to ship

```bash
cd /home/raveuk/comfy/music-app
git status
```

Expected (your specifics will differ):

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   web/App.tsx
        modified:   web/components/UsernameModal.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        web/components/LandingPage.tsx

no changes added to commit (use "git add" / "git commit -a")
```

**Look for anything you don't expect:**

- Files you didn't intend to change (e.g., `.env.local`, `package-lock.json` if you didn't run `npm install`)
- Files with secrets (`.env`, `*.key`, `credentials.json`)
- Generated build artifacts (`dist/`, `.next/`) — these should be in `.gitignore` already
- Experiments / scratch files

If anything's wrong, **stop**. Restore unwanted files with:

```bash
git restore <file>
```

Or move them out of the repo with:

```bash
mv <file> /tmp/
```

Don't commit "extra" files thinking you'll clean them up later. You won't.

---

## Step 6 — Stage files with `git add`

Stage **specific files**, not the whole tree. `git add -A` and `git add .`
are dangerous because they pick up everything, including new untracked files
you forgot about.

For our example landing-page change:

```bash
git add web/components/LandingPage.tsx
git add web/App.tsx
git add web/components/UsernameModal.tsx
```

If you have many files in the same module, you can stage a directory:

```bash
git add web/components/landing/
```

If you have many files across the repo, add them one at a time and check
`git status` after each — it's tedious but safe.

After staging, confirm what's staged:

```bash
git status
```

Expected:

```
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
        new file:   web/components/LandingPage.tsx
        modified:   web/App.tsx
        modified:   web/components/UsernameModal.tsx
```

Anything in "Changes not staged for commit" or "Untracked files" will **not**
be in the commit. If something should be staged, run `git add <file>` again.

---

## Step 7 — Last-look diff before committing

```bash
git diff --staged
```

This shows the exact line-by-line changes that will go into the commit. Read
through them. Look for:

- Debug `console.log()` you forgot to remove
- Hardcoded URLs / API keys / passwords
- Commented-out blocks of code
- TODO comments referencing yourself ("// TODO: I'll fix this later")

If you find any, edit the file, then `git add <file>` again to re-stage.

If the diff is small enough, paste it into a chat with someone (or with Claude)
for a second pair of eyes. **For risky changes (auth, payments, anything
user-facing), do this.**

To see just the file names without the content:

```bash
git diff --staged --stat
```

Output looks like:

```
 web/App.tsx                          | 18 ++++++++--
 web/components/LandingPage.tsx       | 400 ++++++++++++++++++++++++++++++++++++++++++++
 web/components/UsernameModal.tsx     |  9 +++++--
 3 files changed, 420 insertions(+), 7 deletions(-)
```

That gives you a quick "is the volume of change right?" sanity check.

---

## Step 8 — Commit with a meaningful message

Commit messages in this repo follow this style: **subject line, blank line,
explanation body**. Subject ≤ 72 chars, body wraps at ~72 cols.

The body must answer **why**, not **what**. The diff already shows what
changed; the commit message captures the reasoning for future readers
(including future you).

Examples of good commit subjects from this repo:

- `Auth: prefer popup, fall back to redirect, log redirect outcomes`
- `Drop COOP/COEP headers — they were blocking Firebase Auth iframe`
- `Fix Google sign-in: use signInWithRedirect to bypass COOP`

**The heredoc pattern** (preserves multi-line formatting):

```bash
git commit -m "$(cat <<'EOF'
Landing: redesign with Suno-style hero, listen wall, FAQ

The previous unauthenticated entry point was a single empty app shell
overlaid with the auth modal — visitors had no idea what the product was
before being asked to sign up. Replaces it with a marketing landing page
that lets visitors browse, listen to real tracks, and read FAQs without
ever creating an account. Auth modal now opens on explicit CTA click and
is dismissable with × / outside-click.

Also fixes UsernameModal so it respects isOpen + onClose. Previously it
ignored both props and just rendered whenever the user wasn't
authenticated, which made it impossible to render a landing under it.
EOF
)"
```

Expected output:

```
[main fac0691] Landing: redesign with Suno-style hero, listen wall, FAQ
 3 files changed, 420 insertions(+), 7 deletions(-)
 create mode 100644 web/components/LandingPage.tsx
```

**Troubleshooting:**

| Output | Meaning | Fix |
|---|---|---|
| `nothing to commit, working tree clean` | You didn't `git add` anything | Go back to step 6 |
| `Please tell me who you are` | Git user.name/email not set | `git config --global user.name "..."` and `user.email "..."` |
| Pre-commit hook failed | A linter caught something | Read the hook output, fix the issue, `git add`, re-commit |

**Do not use `git commit --amend`** unless you're absolutely sure. If a hook
fails, the commit DID NOT happen — amending the previous commit would modify
unrelated history. Just fix the issue, re-stage, and create a new commit.

---

## Step 9 — Push to `main`

```bash
git push origin main
```

This triggers the **pre-push hook**, which runs `vite build` again to catch
build errors before Cloudflare does. Expected output:

```
Enumerating objects: 11, done.
Counting objects: 100% (11/11), done.
Delta compression using up to 8 threads
Compressing objects: 100% (8/8), done.
Writing objects: 100% (8/8), 5.32 KiB | 5.32 MiB/s, done.
Total 8 (delta 5), reused 0 (delta 0), local objects: 1
remote: Resolving deltas: 100% (5/5), completed with 4 local objects.
↻ pre-push: building web/ to catch parse/type errors before Cloudflare Pages…
✓ pre-push: build OK
To https://github.com/raveuk/ZimbabeatsAIMusic.git
   2415743..fac0691  main -> main
```

**Note the SHAs:** `2415743..fac0691` shows the before/after commit hashes.
**Write down or memorize the second one** (`fac0691` in this example) — you'll
need it to query Cloudflare's build status in step 10.

To grab it programmatically:

```bash
NEW_SHA=$(git rev-parse HEAD)
echo "deploying: $NEW_SHA"
```

**Troubleshooting:**

| Output | Meaning | Fix |
|---|---|---|
| `error: pre-push hook failed` | Local build failed | Read the hook output, fix the error, re-commit, retry push |
| `! [rejected]    main -> main (non-fast-forward)` | Someone else pushed; your local main is behind | `git pull --rebase origin main`, resolve conflicts if any, retry push |
| `fatal: Authentication failed` | gh token expired | `gh auth login` again |
| `fatal: Could not read from remote` | Network issue | Check connectivity, retry |

**Do not use `git push --force` to main.** If you need to overwrite history on
main, talk to whoever else has the repo cloned first — force push wipes their
work.

---

## Step 10 — Watch Cloudflare Pages build

Cloudflare Pages auto-deploys every push to `main`. Builds typically take
**2–5 minutes**.

### Option A — `gh` CLI (recommended, stays in terminal)

```bash
gh api "repos/raveuk/ZimbabeatsAIMusic/commits/$(git rev-parse HEAD)/check-runs" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for c in d.get('check_runs', []):
    name = c.get('name', '?')
    status = c.get('status', '?')
    conclusion = c.get('conclusion') or 'in progress'
    started = c.get('started_at', '?')
    print(f'{name}: {status} / {conclusion}  (started {started})')"
```

Possible outputs:

```
Cloudflare Pages: queued / in progress      (started 2026-06-10T10:30:00Z)
Cloudflare Pages: in_progress / in progress (started 2026-06-10T10:30:00Z)
Cloudflare Pages: completed / success       (started 2026-06-10T10:30:00Z)
Cloudflare Pages: completed / failure       (started 2026-06-10T10:30:00Z)
```

Re-run every 30–60 seconds until it says `completed / success`. If it says
`failure`, jump to **Step 14 (rollback)** and check Cloudflare logs to
diagnose.

### Option B — Cloudflare dashboard (live build logs)

1. Open https://dash.cloudflare.com
2. Click **Pages** in the left sidebar
3. Click **`zimbabeatsaimusic`** (the project)
4. Click **Deployments** tab
5. The top deployment row is your latest push
6. Click it to see live build logs streaming

This is the **best option if the build fails** — you can read the actual stack
trace from the Cloudflare build environment.

### Option C — Poll the live site

```bash
# Before deploy:
OLD=$(curl -s https://myuzika.com/ | grep -oE 'assets/index-[^"]*\.js' | head -1)
echo "before: $OLD"

# Run this every minute:
NEW=$(curl -s "https://myuzika.com/?$RANDOM" | grep -oE 'assets/index-[^"]*\.js' | head -1)
echo "now:    $NEW"
```

When `NEW` differs from `OLD`, the deploy is live.

---

## Step 11 — Verify the new bundle is serving

```bash
curl -s "https://myuzika.com/?$RANDOM" | grep -oE 'assets/index-[^"]*\.js' | head -1
```

Expected: a filename with a hash, e.g. `assets/index-poHYH36H.js`.

The hash should be **different** from what was serving before your push. The
random query string at the end (`?$RANDOM`) bypasses CDN cache.

**If the hash hasn't changed after Cloudflare reports `success`:**

- Wait 30 more seconds — sometimes CDN propagation lags.
- Try a different curl with `Cache-Control: no-cache`:
  ```bash
  curl -sH "Cache-Control: no-cache" https://myuzika.com/ | grep -oE 'assets/index-[^"]*\.js' | head -1
  ```
- Worst case: Cloudflare deployed but the production alias didn't promote.
  Open the Cloudflare dashboard → Deployments → check if the new build is
  "Production" or "Preview". If it's stuck as Preview, click "Promote to
  Production".

**Don't trust the hash being the same as your local build.** Vite includes
node version + module-resolution differences in the content hash, so CF's
clean install produces a different hash than your local. As long as the live
hash is **different from before**, the new code is live.

---

## Step 12 — Verify headers if you changed `web/public/_headers`

Skip this if your change didn't touch `_headers`. Otherwise:

```bash
curl -sI https://myuzika.com/ | grep -iE "cross-origin|content-security|cache-control|x-"
```

Expected: the headers you intended. For example, after removing COOP/COEP:

```
cache-control: public, max-age=0, must-revalidate
referrer-policy: strict-origin-when-cross-origin
x-content-type-options: nosniff
```

There should be **no** `cross-origin-opener-policy` or
`cross-origin-embedder-policy` lines (since we removed those).

If old headers persist, Cloudflare's edge cache is holding stale meta. Force
a fresh fetch by appending a random query: `curl -sI "https://myuzika.com/?$RANDOM"`.

---

## Step 13 — Click-test on production in a private window

**Open a private/incognito window** (Ctrl+Shift+P / Ctrl+Shift+N).

Visit **https://myuzika.com**.

Walk the same flows you tested in step 3, but now against production:

1. ✅ Landing renders
2. ✅ Listen wall plays inline
3. ✅ Sign-in modal opens & closes
4. ✅ Google sign-in completes
5. ✅ Authenticated app renders your tracks
6. ✅ Navigate to Create / Library / AI Video / Settings without console errors

**Pay extra attention to these production-only failure modes:**

- **Environment variable missing.** If your code uses
  `process.env.VITE_FIREBASE_API_KEY`, Cloudflare needs that env var configured
  in its Pages settings. If a feature works locally but breaks on prod,
  suspect a missing env first.
- **API URL hardcoded to localhost.** Search for any `http://localhost:3000`
  or `http://127.0.0.1` in your changes. All API calls must be relative
  (`/api/...`) so they hit the same domain.
- **CORS error on a new API call.** If you added a fetch to a different
  domain, the prod backend may not have it whitelisted.
- **Service worker serving stale code.** If you have a service worker
  installed, even a hard refresh won't always get the new bundle. Clear via
  DevTools → Application → Service Workers → Unregister, then refresh.

If everything works, you're done. The deploy is live and verified.

---

## Step 14 — Roll back if production is broken

Sometimes the live site breaks despite passing local tests. Don't panic —
roll back first, debug second.

### Fast rollback (Cloudflare dashboard)

1. https://dash.cloudflare.com → Pages → `zimbabeatsaimusic`
2. Click **Deployments** tab
3. Find the **last known-good deployment** (the row just above your broken one)
4. Click the **`…`** menu on that row
5. Click **Rollback to this deployment**
6. Confirm

Cloudflare promotes that build to `myuzika.com` within ~30 seconds.
Production is now stable.

### Then fix the bug

In your editor:
1. Identify the issue from the Cloudflare build logs or browser console
2. Fix it
3. Test locally (steps 1–4)
4. Commit (steps 5–8)
5. Push (step 9)
6. The new push triggers a fresh Cloudflare build that supersedes the rolled-back deploy

### Reflect rollback in git history (optional but tidy)

If you want git to also reflect the bad commit being reverted:

```bash
git revert <bad-sha>
```

This creates a new "Revert X" commit. Pushing it triggers a Cloudflare build
identical to the rolled-back state.

**Do not** do `git reset --hard <good-sha>` and force-push. That wipes the
commit log of the failure — future you will wonder what happened.

---

## Quick reference — happy-path single command sequence

For when you've already tested locally and just need to ship:

```bash
cd /home/raveuk/comfy/music-app

# 1. Inspect
git status
git diff

# 2. Stage explicitly
git add web/components/LandingPage.tsx web/App.tsx

# 3. Last look
git diff --staged --stat

# 4. Commit
git commit -m "subject

body explaining why"

# 5. Push (triggers pre-push build + Cloudflare auto-deploy)
git push origin main

# 6. Watch CF build
sleep 60
gh api "repos/raveuk/ZimbabeatsAIMusic/commits/$(git rev-parse HEAD)/check-runs" \
  | python3 -c "import json,sys; [print(c['name'],c.get('conclusion') or c['status']) for c in json.load(sys.stdin).get('check_runs', [])]"

# 7. Verify new bundle
curl -s "https://myuzika.com/?$RANDOM" | grep -oE 'assets/index-[^"]*\.js' | head -1

# 8. Open a private browser window and click around https://myuzika.com
```

---

## Stopping the dev servers

When you're done deploying, stop your local dev servers:

- **Terminal A (backend)**: press **Ctrl+C** → wait for `next dev` to exit
- **Terminal B (frontend)**: press **Ctrl+C** → wait for Vite to exit

If you used background terminals or screen / tmux, kill them:

```bash
pkill -f "next dev"
pkill -f "vite"
```

Verify ports are free:

```bash
ss -tlnp | grep -E ":3000|:3001"
```

Should output nothing if both are stopped.

---

## Common gotchas, in order of frequency you'll hit them

### "I pushed and Cloudflare hasn't rebuilt"

- **Did the push actually land?** `git log origin/main -1` should show your
  commit at the top.
- **Is Cloudflare integration installed on the repo?** Settings → Integrations
  → Cloudflare Pages should show "Connected".
- **Did the build trigger but fail silently?** Check the Cloudflare dashboard
  → Deployments tab for a row matching your commit SHA.

### "The local build works but Cloudflare's build fails"

Almost always **environment differences**:
- Local: Node 20.18, Cloudflare: Node 22 (or vice versa). Pin via
  `nvmrc` or `engines` in `package.json`.
- Local: `node_modules` cached, Cloudflare: clean install. If a dep is
  missing from `package.json` but installed locally, CF will fail.
- Local: `.env.local` provides a value, Cloudflare: no env var set. Add the
  var in Cloudflare Pages settings → Environment Variables.

### "I deployed but my normal browser still shows the old version"

- **Hard refresh**: Ctrl+Shift+R.
- If that doesn't work, **clear site data**: DevTools → Application →
  Storage → "Clear site data" button.
- If THAT doesn't work, you may have a service worker holding stale state:
  DevTools → Application → Service Workers → "Unregister" → refresh.

### "My env var isn't loading in prod"

Vite env vars **must be prefixed `VITE_`** to be exposed to the browser bundle.
`MY_KEY=...` in `.env` will not appear in `import.meta.env`. Use `VITE_MY_KEY=...`.

Cloudflare Pages env vars are set in: Dashboard → Pages → project → Settings
→ Environment Variables. Add the variable, then **trigger a new deployment**
— env vars apply at build time, so changing one doesn't redeploy
automatically.

### "The pre-push hook keeps failing"

Open `.git/hooks/pre-push` and read what it does. If you intentionally want
to skip it (only for emergency hotfixes):

```bash
git push --no-verify origin main
```

But fix the underlying issue afterwards. The hook exists for a reason.

### "I committed a secret"

If you committed a `.env` or API key:

1. **Rotate the credential immediately** (don't wait — assume it's compromised
   the moment it's in git history, even on a private repo).
2. Remove from history:
   ```bash
   git rm --cached .env
   echo ".env" >> .gitignore
   git add .gitignore
   git commit -m "Remove accidentally-committed .env"
   git push
   ```
3. If the commit isn't pushed yet, easier: `git reset --soft HEAD~1` to undo
   the commit, then re-stage without the secret.

Note: removing a file in a new commit doesn't wipe it from git history. For
that you need `git filter-repo` or `BFG Repo-Cleaner` — but rotating the
credential is much faster and equivalently safe.

---

## When to update this doc

If you notice:
- A step doesn't match what you actually do
- A new common gotcha worth recording
- A useful diagnostic command you wish was in the quick reference

Edit this file directly. It's checked in with the code; deploying yourself
forces you to think about whether the new behavior should be documented.
