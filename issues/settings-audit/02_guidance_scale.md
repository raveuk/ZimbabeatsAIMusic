# Issue 02 — Guidance Scale slider was "for show"

## Symptom
The "Guidance Scale" slider in Advanced Settings (default was 9.0) could be moved
but had zero effect on generated audio.

## Root cause
`toBackendBody()` (web/services/api.ts) never included `guidanceScale` in its
return object, so the value was dropped before the request left the browser. The
backend's `buildGraph()` also never touched KSampler.cfg — it stayed at the
template's hardcoded 4.

## Verified wireable
Live query of ComfyUI `/object_info/KSampler` confirms KSampler has a real
`cfg` (FLOAT) input. So the slider CAN drive the diffusion guidance.

## Fix
1. `web/services/api.ts` — `toBackendBody` now forwards:
   ```js
   guidanceScale: typeof p.guidanceScale === 'number' && p.guidanceScale > 0 ? p.guidanceScale : undefined,
   ```
2. `server/lib/workflow.js` — `buildGraph` now applies it:
   ```js
   if (input.guidanceScale != null) g[SAMPLER_NODE].inputs.cfg = clamp(Number(input.guidanceScale), 1, 15);
   ```
3. `web/components/CreatePanel.tsx` — default **9.0 → 4.0** so it matches the
   template baseline. (Critical: if we'd wired it while leaving the default at 9.0,
   every generation would suddenly jump from cfg=4 to cfg=9 — a big change that
   itself pushes vocals toward an over-guided/auto-tuned character. Matching the
   default to the template means wiring changes nothing until the user moves it.)

## Verification
Move Guidance Scale → value reaches KSampler.cfg. Default 4.0 = unchanged behaviour.
Higher = stronger adherence to the prompt (and more "polished"); lower = looser.
Build passed.
