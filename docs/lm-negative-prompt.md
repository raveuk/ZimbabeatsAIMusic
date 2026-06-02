# LM Negative Prompt — why we don't ship it

The `LM Negative Prompt` textarea in fspecii's UI is **hidden** in our
build and the backend graph rewrite that supported it has been
**removed**. This is an empirical decision after we tried wiring it.

## What we tried

Standard ACE-Step recipe for "real" negative prompting:

```
node 94: TextEncodeAceStepAudio1.5  (positive, full tags + lyrics)
            └──→ KSampler.positive

node 95: TextEncodeAceStepAudio1.5  (negative, cloned-from-94 with
            inputs identical except `tags` replaced with user's text)
            └──→ KSampler.negative

node 47 (ConditioningZeroOut) left orphaned — ComfyUI skips it.
```

The math is supposed to work because CFG's `pos + cfg × (pos − neg)`
subtraction cancels the shared inputs (lyrics, BPM, seed, clip, LM
sampling knobs) so only the *tag delta* steers the diffusion.

Model: Studio (acestep_v1.5_xl_sft_bf16). KSampler.cfg = 5. The XL SFT
checkpoint is the one the official upstream guidance says supports
"true negative audio guidance" at CFG > 1.

## What actually happened

Three A/B tests on real generations:

| Track | Same seed control? | Negative prompt | Result |
|---|---|---|---|
| #61 | – | "no rap, no shouting, no distortion, no harsh vocals, no autotune" | **distorted** |
| #62 | yes, seed 495444281, no negative | – | clean reference |
| #63 | – | same negative as #61 | **distorted** |
| #64 | – (different seed) | same negative as #61 | **distorted** |

#62 vs #61 (same seed, only difference: negative on/off) was the
decisive A/B — clean without, distorted with. #63 and #64 confirmed
the failure is reproducible across seeds.

## Why this happens (best guess)

ACE-Step's encoder is autoregressive — `TextEncodeAceStepAudio1.5`
runs a Qwen 4B LM that generates *audio code tokens*, not a smooth
embedding. The CFG cancellation math (`pos − neg`) treats positive
and negative predictions as continuous vectors that subtract
linearly. For autoregressive token sequences this subtraction
doesn't produce a coherent steering signal — the resulting
"direction" the sampler tries to chase is closer to noise than
to "the difference between tag styles".

The official ACE-Step workflow uses `ConditioningZeroOut` on the
negative slot. That's not a placeholder — it's the model's
canonical, tested setup. The "real negative is possible on XL SFT"
guidance from third-party sources doesn't appear to hold for our
configuration.

## Decision

- UI: textarea hidden in `web/components/CreatePanel.tsx`
- Frontend payload: `negativePrompt` no longer forwarded
- Backend route: `negativePrompt` not in the params object
- `workflow.js`: graph rewrite removed; ConditioningZeroOut is the
  only negative path

State variable `lmNegativePrompt` is left in CreatePanel so other
code that destructures it doesn't break — its value never reaches
the backend.

Revisit only if:
1. A future ACE-Step variant exposes a real `negative_tags` input on
   the TextEncode node itself (so CFG cancellation isn't needed), or
2. We add a different audio model that uses standard diffusion CFG
   and a continuous-embedding text encoder.

— Recorded 2026-06-02.
