# Settings Audit — End-to-End Wiring Verification (2026-06-11)

## Why this audit
User reported Key/Time not changing, then asked the harder question:
**"are ALL the settings actually wired to the backend, or just for show?"** —
and explicitly demanded an honest check, no faking.

## Method (no guessing — read the real code + queried the live ComfyUI nodes)
1. Read `toBackendBody()` (web/services/api.ts) **verbatim** — this is the single
   funnel; any field NOT in its return object never reaches the backend.
2. Read `buildGraph()` (server/lib/workflow.js) — what actually gets written into
   the ComfyUI graph nodes.
3. Queried the live ComfyUI `/object_info` for `KSampler` and
   `TextEncodeAceStepAudio1.5` to confirm which inputs the nodes *physically accept*
   (so we never "wire" to an input that doesn't exist).

## Honest correction of my own earlier claims
My first pass (grep reference-counting) over-flagged. The real read corrected TWO:
- **LM Backend** — NOT a bug. Already intentionally hidden (ComfyUI is PT-only).
- **Thinking** — NOT dead. It toggles Chain-of-Thought in the *lyric* writer
  (Ollama, CreatePanel.tsx:823-829). Not a music-graph param, but it does work.

## Final verdict per control

### Genuinely wired (verified reach the ComfyUI graph)
Title, Style, Lyrics, Duration, BPM, **Key**, **Time**, Vocal Language,
MP3 Quality/Audio Format (→ quality), Voice Clone, Steps, LM Temperature,
LM CFG Scale, Top-P, Top-K, Shift, Seed, LoRA, Vocal Gender (appended to style),
Thinking (lyric writer), Instrumental.

### Were "for show" — now FIXED this session
| Control | Issue file | Fix |
|---|---|---|
| Key / Time (Simple mode) | 01_key_time_simple_mode.md | Bad onChange handler — fixed |
| Guidance Scale | 02_guidance_scale.md | Wired → KSampler.cfg |
| Infer Method (ODE/SDE) | 03_infer_method.md | Wired → KSampler.sampler_name |
| LM Model dropdown | 04_lm_model_dropdown.md | Hidden (can't change — CLIP loader fixed) |
| Variations (hidden dupe input) | 05_hidden_batchsize_input.md | Fixed dead handler |

## Files changed
- web/components/CreatePanel.tsx (Key/Time handlers, guidanceScale default 9→4,
  inferMethod default ode→sde, LM Model hidden, hidden batchSize handler)
- web/services/api.ts (toBackendBody now forwards guidanceScale + inferMethod)
- server/lib/workflow.js (buildGraph applies cfg + sampler_name)

## Not yet committed — pending user verification.
