# vLLM backend — why we don't use it

The upstream UI (`fspecii/ace-step-ui`) had a "LM Backend: PT / vLLM" picker
in Advanced Settings. We've **hidden it** in our build. This note records
why, so future me / a new contributor doesn't reach for it again.

## What it was for upstream

fspecii's pipeline made a *separate LLM call* for prompt enhancement
(rewriting a user's brief description into a more detailed ACE-Step prompt)
before kicking off the actual music generation. That LLM call was the
chattiest, latency-heaviest step in their architecture. They wired vLLM
as an optional accelerator there — pure PyTorch (~2-4 GB VRAM) vs vLLM
(~3-5 GB VRAM but 1.5-3× faster on capable GPUs).

## Why it doesn't apply to us

1. **We don't have that separate enhancement step.** Our "Write lyrics"
   button calls our own `/api/lyrics` route, which talks to Ollama
   (currently `gemma4:31b-cloud` — runs on Ollama's cloud infrastructure,
   not on our GPU). That request takes ~3-7s including network. vLLM
   wouldn't speed up a cloud-hosted Gemma — it already runs on faster
   hardware than our 3090.

2. **The LM step *inside* ACE-Step is tiny.** ACE-Step's
   `TextEncodeAceStepAudio1.5` node uses a Qwen 4B encoder to turn the
   tags+lyrics into audio codes. That step takes ~1-2 seconds out of the
   ~30-60 second total music generation. Even an infinite-speedup of
   that step would be ~2% wall-clock improvement.

3. **Continuous batching doesn't help in single-user mode.** vLLM's
   biggest gains come from running many users' LM requests through one
   batched forward pass. ACE-Step doesn't queue at the LM layer — it
   queues at the diffusion UNET. To batch across users you'd batch the
   UNET, not the LM. That's a much bigger lift and unrelated to vLLM.

4. **ComfyUI has no vLLM integration for ACE-Step out of the box.** The
   `TextEncodeAceStepAudio1.5` node uses regular PyTorch. To swap in vLLM
   you'd need to:
   - `pip install vllm` in ComfyUI's venv
   - Stand up a vLLM server with the Qwen 4B weights
   - Write a custom ComfyUI node (`TextEncodeAceStepAudio1.5_vllm`) that
     POSTs to vLLM instead of using the in-process torch model
   - Swap that node into `server/workflow.api.json`

   That's ~half a day of engineering for ~1 second saved per generation.

## Where the actual speed wins live

If/when we're actually GPU-bound, in priority order:

1. **Step-distillation LoRA** (`lightx2v`-style) — cuts ACE-Step from
   30 sampling steps to 6-8 with knowledge distillation preserving
   quality. ~3× faster on the diffusion (the real bottleneck). Half a day
   to integrate.

2. **TensorRT compile of the UNET** — 2-3× faster diffusion, identical
   output, requires a one-time compile step.

3. **GPU upgrade** — second 3090 doubles throughput linearly; an H100
   quadruples it. Hardware solution for "more concurrent users". Zero
   code change.

4. **Continuous batching on the UNET** — combine multiple users' jobs
   into one diffusion forward pass. Genuine multi-user scaling, big
   lift on the ComfyUI custom-node side.

## Decision

Hide the LM Backend selector. Value stays internal as `'pt'`. Revisit
only if (a) we add a separate enhancement-LLM call that runs on local
GPU, or (b) we move the LM step off Ollama Cloud onto a self-hosted
Qwen 4B that vLLM could serve. Neither is on the near-term roadmap.

— Recorded 2026-06-02.
