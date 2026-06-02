# LM Negative Prompt — how it's wired

The `LM Negative Prompt` textarea in Advanced → Expert Controls steers
the diffusion away from whatever the user types (e.g. *"no rap, no
shouting, no distortion"*). Empty = behaves as if the field isn't
there. Non-empty = graph rewrite at request time.

## Why this is non-trivial for ACE-Step

ACE-Step's encoder is autoregressive — `TextEncodeAceStepAudio1.5`
runs a Qwen 4B LM that *generates audio code tokens* from the prompt.
The default workflow uses a `ConditioningZeroOut` on the negative
slot because:

- For **Turbo** (distilled, runs at CFG = 1), diffusion-level CFG is
  effectively off — there's no negative-direction signal to steer
  *with*. The zero-out is the canonical setup.
- For **Studio / XL SFT** at CFG > 1, real negative prompting is
  possible — you just need a second TextEncode and a CFG that
  actually applies the delta.

So we wire it **conditionally** rather than via a single-node trick
like `PlusMinusTextClip` (which produces stock CLIP embeddings — the
wrong latent space for ACE-Step's KSampler).

## Graph rewrite (server/lib/workflow.js)

Default graph (when negative prompt is empty):

```
node 94: TextEncodeAceStepAudio1.5   ──→ KSampler.positive
            │
            └──→ node 47: ConditioningZeroOut ──→ KSampler.negative
```

With non-empty negative prompt:

```
node 94: TextEncodeAceStepAudio1.5   ──→ KSampler.positive
                                        (positive: full tags + lyrics)

node 95: TextEncodeAceStepAudio1.5   ──→ KSampler.negative   ← NEW
            inputs cloned from 94,
            tags replaced with user's
            negative prompt.

node 47 stays in the graph but is now orphaned — ComfyUI skips
unreferenced nodes, no error.
```

Cloning *all* inputs from 94 onto 95 (lyrics, BPM, duration, seed,
clip, all LM-sampling knobs) is intentional. CFG math is:

```
noise = neg + cfg × (pos − neg)
```

The shared inputs (lyrics, BPM, …) appear in **both** pos and neg
predictions, so they cancel out of `pos − neg`. Only the
*tag delta* survives the subtraction, meaning the user's negative
input genuinely steers the diffusion away from those style words
without polluting lyric fidelity.

## Caveats

1. **Turbo + non-empty negative**: still goes through the same
   second-TextEncode path. With our current `KSampler.cfg = 5` it
   *should* steer, but Turbo's distillation was tuned around CFG ≈ 1,
   so negative-prompt quality might degrade. Users get the best
   negative-prompt experience on Studio.
2. **Empty negative**: graph is untouched, ConditioningZeroOut still
   in play. No risk to existing behavior.
3. **Negative prompt is treated as `tags`, not `lyrics`**: we put the
   user's text in the negative node's `tags` field. ACE-Step interprets
   tags as genre/style/instrumentation descriptors — that's the right
   semantic level for "no rap, no shouting", *not* "don't sing the
   word 'banana'" (which would be a lyrics-level thing the model
   probably doesn't honor).

## Backend payload

Client sends `{ negativePrompt: "no rap, no shouting" }` in the
`/api/generate` body. Empty / missing / whitespace-only values are
coerced to `undefined` by the frontend (`toBackendBody` in
`web/services/api.ts`) so the backend doesn't trigger the rewrite for
non-input.

— Recorded 2026-06-02.
