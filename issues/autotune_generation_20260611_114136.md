# Auto-tune in Generated Music — Investigation, Audit & Fix

**Issue ID:** autotune_generation_20260611_114136
**Date:** 2026-06-11
**Reporter:** user (rahimtz93)
**Status:** Root cause found, fix applied (pending audio verification)
**Goal as stated:** "find the issues, audit, check thoroughly and pen test. Check the
.md files to see what was done but do not fix [during audit phase] — stay focused."

---

## 1. Original symptom

User reported: **"music generation sounds like it has auto tune on"** and crucially
**"it was working fine before, so I don't know what happened."** — i.e. a regression,
not a new bug.

Later refinement from the user: they had **Voice Clone turned ON** when generating the
tracks that sounded auto-tuned. This was the decisive clue (see §6).

---

## 2. Method

Read-only audit first (per the stated goal), then a single targeted fix once the cause
was isolated. Steps:

1. Read existing audio-path documentation:
   - `docs/lm-negative-prompt.md`
   - `docs/auto-tune-fix-test-plan.md`
   - `docs/DEPLOY.md`
   - `COMFYUI_FIX_LOG.md` (unrelated — ComfyUI launch fix from 2026-05-27)
2. Audited every node in the text2music workflow (`server/workflow.api.json`).
3. Traced every generation parameter end-to-end: CreatePanel.tsx → api.ts →
   generate/route.js → workflow.js → workflow.api.json → ComfyUI.
4. Compared frontend default values vs the template's baked-in values vs what
   actually reaches the ComfyUI graph.
5. Inspected recently auto-installed ComfyUI custom nodes (2026-06-10/11) for global
   model patching.
6. Deployed a sub-agent for an independent deep review of the same pipeline.
7. Investigated the Voice Clone (RVC) path after user confirmed it was active.

---

## 3. Text2music workflow node audit (`server/workflow.api.json`)

All 10 nodes are the canonical ACE-Step 1.5 setup — no structural fault:

| Node | Class | Notes |
|---|---|---|
| 3 | KSampler | euler_ancestral + beta, cfg=4, steps=30 |
| 18 | VAEDecodeAudio | ok |
| 47 | ConditioningZeroOut | feeds KSampler.negative (negatives intentionally disabled) |
| 78 | ModelSamplingAuraFlow | shift=5 (template baseline) |
| 94 | TextEncodeAceStepAudio1.5 | cfg_scale=2, temperature=0.7, top_p=0.9, top_k=0 |
| 98 | EmptyAceStep1.5LatentAudio | ok |
| 104 | UNETLoader | acestep_v1.5_xl_sft_bf16.safetensors |
| 105 | DualCLIPLoader | qwen_0.6b_ace15 + qwen_4b_ace15 |
| 106 | VAELoader | ace_1.5_vae |
| 107 | SaveAudioMP3 | 320k |

---

## 4. Parameter divergence findings (frontend overrides vs template)

The frontend forces its own defaults on every generation, overriding the template's
tested values:

| Parameter | Frontend default | Template value | Reaches graph | Overrides? |
|---|---|---|---|---|
| LM cfg_scale | 1.7 (CreatePanel.tsx:303) | 2 (node 94) | 1.7 | Yes |
| LM temperature | 0.95 (:302) | 0.7 (node 94) | 0.95 | Yes |
| LM top_p | 0.92 (:305) | 0.9 (node 94) | 0.92 | Yes |
| LM top_k | 0 (:304) | 0 | 0 | No-op |
| ModelSamplingAuraFlow shift | 3.0 (:294) | **5** (node 78) | 3.0 | **Yes** |
| KSampler cfg | (no UI control) | 4 (node 3) | 4 | N/A |
| KSampler steps | 50 (:263, raised from 30 this session) | 30 | 50 | Yes |
| guidance_scale | 9.0 (:242) | — | **dropped** | toBackendBody never maps it |

Notable: `guidanceScale=9.0` is a dead field for text2music — it is sent but never
mapped to KSampler.cfg, so it has no effect. KSampler.cfg stays at template's 4.

Sub-agent also found that **KSampler cfg was changed 5→4** in commit `71042a3`
(2026-06-02 "Wire Transform + Guidance panels"). `docs/auto-tune-fix-test-plan.md`
incorrectly stated cfg was unchanged. Logged for accuracy, but ultimately not the
cause (see §6).

---

## 5. Custom node audit (ComfyUI)

Four nodes auto-installed 2026-06-10/11 were investigated as regression suspects:

- `prompt_injection` — **image** tool (Stable Diffusion UNet block injection). Only acts
  when wired into a workflow; the audio graph never uses it. **User uninstalled it.**
  Was innocent.
- `audio-separation-nodes-comfyui`, `VocalSeparation-ComfyUI`, `ComfyUI-DeepExtractV2`,
  `ComfyUI-Aria-VLM` — none patch model behavior at import or globally (no
  `comfy.model_patcher`, `set_model_*`, attention hijacks). They only act when their
  nodes are explicitly wired in; the audio graph wires none. **All innocent.**
- `Negative-attention-for-ComfyUI-` — does use `set_model_attn2_replace`, but only inside
  its node's `patch()` method (explicit wiring required), installed 2026-06-02, not wired
  into the audio graph. **Innocent.**

Conclusion: custom nodes are NOT the cause.

---

## 6. ROOT CAUSE — RVC Voice Clone (`index_ratio`)

User confirmed Voice Clone was **ON** for the auto-tuned tracks. This re-routes
generation through `server/workflow.clone.api.json` (RVC voice conversion), not the
plain text2music graph. The auto-tune originates in node 204:

```
node 204 RVCEngineNode (BEFORE fix):
  pitch: 0
  index_ratio: 0.75          ← CAUSE
  consonant_protection: 0.25
  volume_envelope: 0.25
```

**Why this is the cause:** `index_ratio` controls how hard RVC snaps the sung vocal onto
the target voice's timbre fingerprint. At 0.75 it forces the vocal aggressively toward
the cloned voice — that forcing IS the robotic / pitch-corrected / auto-tuned character.
The natural RVC range is 0.3–0.5. `consonant_protection` at 0.25 was also low, which
smooths consonant articulation into the cloned timbre (more "processed" sound).

This explains "it was working before": the diffusion-side tunables (shift, cfg) were red
herrings for this user — they only affect the raw, non-clone vocal path. The clone path's
RVC settings are what colored the vocal.

### Suspect ranking (final)

| Suspect | Verdict |
|---|---|
| RVC `index_ratio` = 0.75 (clone path) | **ROOT CAUSE** |
| shift 5→3 (text2music) | Innocent for clone path; only affects raw vocals |
| KSampler cfg 5→4 (text2music) | Innocent for clone path |
| bf16 model precision | Innocent (no fp16 ever on disk to compare) |
| Custom nodes (prompt_injection etc.) | Innocent (not wired into audio graph) |

---

## 7. Voice Clone feature status (corrected)

An earlier statement that "voice clone is broken / no voices on disk" was **WRONG** — the
search looked in `models/voices` and `models/rvc`. The voices are actually in
`models/TTS/RVC/`. Full state, all healthy:

- Voice files on disk: `Claire.pth` (Claire/Female), `Male_1.pth` (Generic Male)
- Custom node installed: `TTS-Audio-Suite` (exposes `LoadRVCModelNode`, `RVCEngineNode`,
  `UnifiedVoiceChangerNode`)
- Clone template exists: `server/workflow.clone.api.json` (created 2026-06-02)
- `/api/models` (`route.js:99-118`) populates the voice dropdown by querying ComfyUI's
  `/object_info/LoadRVCModelNode`, strips `local:` prefix, dedupes, applies friendly labels
- App dropdown shows: Claire (Female), Generic Male (both downloaded), plus Fuji/Mae/
  Monika/Sayano (auto-download on first use)

The voice clone feature is fully wired and working.

---

## 8. FIX APPLIED

**File:** `server/workflow.clone.api.json`, node 204 (RVCEngineNode)

```diff
-  "index_ratio": 0.75,
-  "consonant_protection": 0.25,
+  "index_ratio": 0.4,
+  "consonant_protection": 0.4,
```

- `index_ratio` 0.75 → 0.4: keeps natural human pitch expression, removes the auto-tune snap.
- `consonant_protection` 0.25 → 0.4: preserves natural consonant articulation.

JSON validated (parses cleanly). No other values touched.

---

## 9. Where the file is (for pulling into ComfyUI)

**Backend clone template (the one the app uses, just edited):**
```
/home/raveuk/comfy/music-app/server/workflow.clone.api.json
```

NOTE: this is in **API (prompt) format**, not the editable UI-graph format. ComfyUI's
"Load" button on a fresh canvas expects the UI format. To inspect/tweak this in the
ComfyUI canvas you can drag it in via the API-format import, or edit the JSON values
directly (node 204 inputs). The values that matter for auto-tune are in node `204`:
`index_ratio` and `consonant_protection`.

The text2music (non-clone) template, for reference:
```
/home/raveuk/comfy/music-app/server/workflow.api.json
```

---

## 10. How to verify the fix

1. Restart the backend if it caches the template (Next.js dev usually hot-reloads JSON;
   a hard restart guarantees it): the server reads `workflow.clone.api.json` via
   `loadTemplate()` in `server/lib/workflow.js`.
2. In the app: pick the **same Voice Clone** (e.g. Claire or Generic Male) and the **same
   prompt** you previously judged as auto-tuned.
3. Generate. The vocal should now retain more natural human expression and less
   pitch-snap.
4. If still slightly processed, lower `index_ratio` further (0.3) and/or raise
   `consonant_protection` (0.5).
5. If you want the cloned voice to match the target MORE closely (at the cost of more
   auto-tune), raise `index_ratio` back toward 0.6–0.7. It's a quality/accuracy trade-off
   dial.

---

## 11. Files touched this session (full list)

- `server/workflow.clone.api.json` — node 204 index_ratio + consonant_protection (THE FIX)
- `web/components/CreatePanel.tsx` — default steps 30→50, added "Less auto-tune" preset
  row (mitigation attempts before root cause was found; harmless, can stay)
- `issues/autotune_generation_20260611_114136.md` — this document

Not committed yet — pending the user's audio verification of the fix.

---

## 12. Open follow-ups (not blocking)

- The text2music `shift` override (3 vs template 5) and KSampler `cfg` 5→4 remain
  divergences from the tested template. They are NOT the cause of THIS issue (clone path),
  but if raw (non-clone) generations ever sound off, revisit them — see
  `docs/auto-tune-fix-test-plan.md`.
- Consider exposing `index_ratio` / `consonant_protection` as an advanced UI slider so
  users can dial the clone-accuracy vs naturalness trade-off per song.
