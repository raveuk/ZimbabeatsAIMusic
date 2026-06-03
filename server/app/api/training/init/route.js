// POST /api/training/init — the Training page's "Initialize Service" button
// hits this. Validates the picked checkpoint + config and pings the ACE-Step
// venv to make sure it's healthy. We DON'T preload the model into VRAM here —
// `trainer.py` does that at the start of each training run because the model
// is too big to keep resident (ComfyUI itself owns the GPU for inference).
// This is essentially a "is the trainer reachable" probe.
import fs from "node:fs";
import { execFile } from "node:child_process";
import { json, handler, requireUser } from "../../../../lib/api.js";
import { ACE_STEP_DIR, ACE_STEP_PY } from "../../../../lib/training.js";

function pyVersionCheck(timeoutMs = 5000) {
  return new Promise((resolve) => {
    execFile(ACE_STEP_PY, ["--version"], { timeout: timeoutMs }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: (stdout || stderr || "").trim() });
    });
  });
}

export const POST = handler(async (req) => {
  await requireUser(req);
  const body = await req.json().catch(() => ({}));

  if (!fs.existsSync(ACE_STEP_PY)) {
    return json({
      ok: false,
      status: "Trainer venv missing — run `python3 -m venv .venv && pip install -r requirements.txt` in " + ACE_STEP_DIR,
    }, 503);
  }

  const v = await pyVersionCheck();
  if (!v.ok) {
    return json({ ok: false, status: `Trainer Python failed to launch: ${v.output}` }, 503);
  }

  // Validate checkpoint + config paths if provided.
  if (body.checkpoint && !fs.existsSync(body.checkpoint)) {
    return json({ ok: false, status: `Checkpoint not found: ${body.checkpoint}` }, 400);
  }
  if (body.config && !fs.existsSync(body.config)) {
    return json({ ok: false, status: `Config not found: ${body.config}` }, 400);
  }

  // Echo back the picked config — the trainer pulls these flags at job-start
  // time, so we just record what the user wants here. UI flags that the
  // upstream trainer.py doesn't expose directly (Backend PT/vLLM, Init LLM,
  // Compile, Quantization) are accepted but not forwarded to trainer.py.
  return json({
    ok: true,
    status: `Trainer ready (${v.output}).`,
    config: {
      checkpoint: body.checkpoint || null,
      config: body.config || null,
      device: body.device || "cuda",
      backend: body.backend || "pt",
      initLlm: !!body.initLlm,
      useFlashAttention: !!body.useFlashAttention,
      offloadToCpu: !!body.offloadToCpu,
      offloadDitToCpu: !!body.offloadDitToCpu,
      compile: !!body.compile,
      quantization: !!body.quantization,
      lmModelPath: body.lmModelPath || null,
    },
    aceStepDir: ACE_STEP_DIR,
  });
});
