# Issue 04 — LM Model dropdown changed nothing

## Symptom
A visible "LM Model" dropdown in Advanced Settings, populated from /api/models,
but selecting a different entry had no effect on generation.

## Root cause (verified end-to-end, 2026-06-11)

1. **Not forwarded.** `toBackendBody()` never includes `lmModel` in its return
   object, so the value is dropped before the request leaves the browser.

2. **The dropdown was never a chooser — it just mirrors the fixed config.**
   `server/app/api/models/route.js:70-76` builds `lmModels` by reading the
   template's `DualCLIPLoader` and listing its TWO existing slots:
   - `clip_name1` = `qwen_0.6b_ace15.safetensors` (role: **tags** encoder)
   - `clip_name2` = `qwen_4b_ace15.safetensors`   (role: **lyrics** encoder)
   So the two dropdown entries are the two halves of ONE setup, labelled by
   role — not interchangeable alternatives.

3. **ACE-Step requires BOTH encoders loaded together.** qwen_0.6b encodes the
   style tags, qwen_4b encodes the lyrics; DualCLIPLoader loads them as a pair.
   It is not a "pick one LM" situation, so a single-select control can't map
   onto it.

4. **No alternate ACE-Step LM exists on disk.** Verified the live
   `/object_info/DualCLIPLoader` clip_name options against what's in
   `models/text_encoders/`. The only other text-encoder files present are
   `gemma_3_12B_it_fp4_mixed`, `umt5_xxl` (×3 variants), and
   `models_t5_umt5-xxl-enc-bf16` — and those belong to OTHER model families
   (umt5/t5 → Wan video, gemma → general LLM). Loading any of them into
   ACE-Step's DualCLIPLoader would BREAK generation, not provide a different
   LM. (Same incompatibility class as the video-LoRA issue.)

5. ComfyUI `/object_info/TextEncodeAceStepAudio1.5` confirms the node itself has
   NO model-selection input — the LM is fixed by the CLIP loader.

Net: there is no valid second option to offer, so the control was inert.

## Decision: HIDE (not wire)
Unlike Guidance Scale / Infer Method, there is no valid target to wire this to and
no alternate model to pick. Leaving it visible is misleading. Hidden via
`<div className="hidden">` wrapper in CreatePanel.tsx so the `lmModel` state other
code references (startGeneration payload) keeps working without rendering a dead
control.

## Re-enable criteria
Un-hide only when BOTH: (a) alternate qwen/ACE-Step LM CLIP files exist on disk,
and (b) the backend wires `lmModel` → DualCLIPLoader `clip_name` swapping.

## Verification
LM Model no longer appears in Advanced. Build passed.
