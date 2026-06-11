# Issue 03 — Infer Method (ODE/SDE) toggle was "for show"

## Symptom
The ODE/SDE toggle in Advanced could be switched but changed nothing.

## Root cause
`toBackendBody()` did not forward `inferMethod`; `buildGraph()` never set the
sampler. KSampler.sampler_name stayed at the template's `euler_ancestral`.

## Verified wireable
ComfyUI `/object_info/KSampler` shows `sampler_name` is a LIST including
`euler`, `euler_ancestral`, etc. Mapping:
- **ODE** (deterministic) → `euler`
- **SDE** (stochastic / ancestral) → `euler_ancestral` (the template default)

## Fix
1. `web/services/api.ts` — forward:
   ```js
   inferMethod: p.inferMethod === 'ode' || p.inferMethod === 'sde' ? p.inferMethod : undefined,
   ```
2. `server/lib/workflow.js`:
   ```js
   if (input.inferMethod === "ode") g[SAMPLER_NODE].inputs.sampler_name = "euler";
   else if (input.inferMethod === "sde") g[SAMPLER_NODE].inputs.sampler_name = "euler_ancestral";
   ```
3. `web/components/CreatePanel.tsx` — default **'ode' → 'sde'** so it matches the
   template's euler_ancestral. (Same reasoning as Guidance Scale: wiring must not
   silently change existing behaviour. The old default 'ode' did nothing before;
   if we wired it and kept 'ode', every render would switch to euler.)

## Confidence note
ODE→euler / SDE→euler_ancestral is the standard, defensible mapping (ancestral
samplers inject noise = stochastic). It is not a value ACE-Step documents
node-side, so treat it as "wired and sensible" rather than "officially blessed".

## Verification
Toggle ODE/SDE → sampler_name changes in the graph. Default 'sde' = unchanged
behaviour. Build passed.
