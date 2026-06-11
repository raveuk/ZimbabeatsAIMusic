# Issue 04 — LM Model dropdown changed nothing

## Symptom
A visible "LM Model" dropdown in Advanced Settings, populated from /api/models,
but selecting a different entry had no effect on generation.

## Root cause
Two layers:
1. `toBackendBody()` never forwarded `lmModel`.
2. Even if it did, the workflow's `DualCLIPLoader` (node 105) is hardcoded to
   `qwen_0.6b_ace15.safetensors` + `qwen_4b_ace15.safetensors`, and those are the
   only ACE-Step LM CLIP files on disk. There is nothing else to switch to.

ComfyUI `/object_info/TextEncodeAceStepAudio1.5` confirms the node has NO model-
selection input either — the LM is fixed by the CLIP loader.

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
