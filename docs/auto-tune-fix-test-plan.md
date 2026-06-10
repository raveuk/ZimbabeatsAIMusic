# Auto-tune Quality Regression — Change Log + Test Plan

User reported: "music generation sounds like it has auto tune on — it was
working fine before, so I don't know what happened". This is the record of
what we changed, what's already shipped, and what to test in order.

## Diagnosis summary

Workflow nodes all audit clean (10 nodes, official ACE-Step 1.5 setup):

| Node | Class | Status |
|---|---|---|
| 3 | KSampler (euler_ancestral + beta, cfg=4, 30 steps) | ✅ |
| 18 | VAEDecodeAudio | ✅ |
| 47 | ConditioningZeroOut (negative path) | intentionally disabled, see `docs/lm-negative-prompt.md` |
| 78 | ModelSamplingAuraFlow (shift=5) | ✅ |
| 94 | TextEncodeAceStepAudio1.5 | ✅ |
| 98 | EmptyAceStep1.5LatentAudio | ✅ |
| 104 | UNETLoader → `acestep_v1.5_xl_sft_bf16` | ⚠️ suspect (precision) |
| 105 | DualCLIPLoader → qwen_0.6b/4b_ace15 | ✅ |
| 106 | VAELoader → ace_1.5_vae | ✅ |
| 107 | SaveAudioMP3 320k | ✅ |

Two strong suspects for the regression:

**Suspect A — custom nodes auto-installed on 2026-06-10**

ComfyUI-Manager auto-installed these the day before the complaint:

- `prompt_injection` — patches UNET attention via `comfy.model_patcher`,
  global hook that can change how ANY model's attention behaves. **Top
  suspect** — explicitly modifies how the diffusion model's vocal
  attention layers run.
- `audio-separation-nodes-comfyui`
- `VocalSeparation-ComfyUI`
- `ComfyUI-DeepExtractV2`

**Suspect B — bf16 model file dated 2026-06-01**

The `acestep_v1.5_xl_sft_bf16.safetensors` file mtime is 2026-06-01 — newly
downloaded. If the previously-working setup used the `fp16` variant of the
same model, the precision drop alone could account for a thinner / more
processed-sounding vocal (fp16 has more mantissa precision than bf16,
matters more for audio than image).

**Why we did NOT re-enable LM negative prompts**

`docs/lm-negative-prompt.md` records an A/B test where adding "no autotune"
as a negative caused distorted output on 3 separate seeds, including a
seed-controlled control. Re-wiring it would silently re-introduce that
regression. Decision: leave `ConditioningZeroOut` in place.

## Changes already pushed (commit `0f42676`)

These are live on production once Cloudflare finishes the deploy:

1. **Default inference steps 30 → 50** (CreatePanel.tsx). Higher step counts
   reduce the polished / quantised vocal artefacts that under-stepped
   diffusion creates. Existing localStorage values are preserved — only
   fresh users get the new default.

2. **New "Less auto-tune" preset row** below the random style tags
   (CreatePanel.tsx). Eight curated phrases that nudge the *positive* tags
   toward raw / organic terms (since negatives are unavailable):
   - raw vocals
   - live recording
   - natural vocals
   - unprocessed
   - warm analog
   - lo-fi
   - acoustic
   - organic feel

   Styled in pink so they read as a quality lever rather than a genre.

## Things to test (in this order)

### Test 1 — verify the deployed UI changes

1. Hard-refresh `https://myuzika.com` after the Cloudflare deploy lands.
2. Go to **Create** mode.
3. Confirm: under the style textarea, there are now TWO rows of tag chips
   — the random genre tags (grey) AND the "Less auto-tune" presets (pink).
4. Confirm: open **Advanced Settings** → **Inference Steps** is now `50`
   by default (for accounts that don't have a saved value).

### Test 2 — disable the recently-installed custom nodes (5 min)

This is the most likely source of the regression.

```bash
sudo systemctl stop comfyui
cd /home/raveuk/comfy/ComfyUI/custom_nodes
mkdir -p .disabled
mv prompt_injection \
   audio-separation-nodes-comfyui \
   VocalSeparation-ComfyUI \
   ComfyUI-DeepExtractV2 \
   .disabled/
sudo systemctl start comfyui
```

Then generate a track with the **exact same prompt as a previous
"sounds auto-tuned" track**. If it now sounds clean, one of those four
nodes was the cause. To narrow which one:

```bash
sudo systemctl stop comfyui
cd /home/raveuk/comfy/ComfyUI/custom_nodes
mv .disabled/prompt_injection ./
sudo systemctl start comfyui
# generate → compare
```

Repeat with each node in turn. The one whose return causes the auto-tune
to reappear is the culprit. Keep it in `.disabled/` permanently.

### Test 3 — try the fp16 model variant

If Test 2 doesn't fix it (or you want belt-and-braces):

```bash
cd /home/raveuk/comfy/ComfyUI/models/diffusion_models
# Replace URL with whatever the official ACE-Step HF page lists for fp16:
wget -O acestep_v1.5_xl_sft_fp16.safetensors \
  https://huggingface.co/ACE-Step/ACE-Step-v1-1.5/resolve/main/acestep_v1.5_xl_sft_fp16.safetensors
```

Then edit `server/lib/workflow.js` line 29:

```js
export const MODEL_FILES = {
  studio: "acestep_v1.5_xl_sft_fp16.safetensors",  // was bf16
  turbo:  "acestep_v1.5_turbo.safetensors",
};
```

Restart the Next.js dev server (or the production server if running) and
re-generate.

### Test 4 — A/B with the anti-AT presets

Once Test 2 or Test 3 has stabilised the baseline:

1. Pick a style you previously hated the auto-tune on
   (e.g. "Korean R&B with smooth male vocals, modern production, 95 BPM")
2. Generate it as-is at seed 12345.
3. Generate again at seed 12345 with the "Less auto-tune" pink chips
   appended (e.g. add: "raw vocals, live recording, warm analog").
4. Compare. The pink presets should steer the positive-prompt cluster
   away from the auto-tune region.

## Test order reasoning

- Test 1 confirms the code change is live (1 min).
- Test 2 is the biggest lever (custom-node interference is the only
  scenario that explains "it was working before" given no workflow code
  changed). 5 min if `prompt_injection` is the cause, ~20 min worst case
  to bisect all four.
- Test 3 is the fallback if Test 2 doesn't help — non-trivial download
  time (~10 GB for the fp16 model) but no risk.
- Test 4 is the validation that the new UI presets actually move the
  needle in the steered direction.

## What we did NOT touch

- The ACE-Step workflow JSON (`server/workflow.api.json`) is unchanged.
- KSampler / TextEncodeAceStepAudio1.5 defaults in the template are
  unchanged (cfg=4, temp=0.7, top_p=0.9, shift=5).
- The frontend defaults for LM temperature (0.95), LM cfg_scale (1.7),
  top_p (0.92), shift (3.0), guidance_scale (9.0) — all preserved.
- Negative prompts stay disabled (`ConditioningZeroOut`).

— Recorded 2026-06-11.
