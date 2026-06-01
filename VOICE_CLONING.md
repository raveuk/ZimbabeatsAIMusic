# Voice cloning (RVC, inside the ComfyUI graph)

ACE-Step can't clone a voice on its own — its text encoder takes only `tags`/`lyrics`,
no reference audio. So cloning is a **post-processing chain appended after ACE-Step**:

```
ACE-Step song  →  separate vocal/instrumental  →  RVC voice-convert the vocal
                                                   (trained .pth per person)
                                                          ↓
            SaveAudioMP3  ←  remix (cloned vocal + original instrumental)
```

RVC keeps the AI singer's **melody and timing** and swaps only the **voice identity**.

> **Consent:** only clone voices you own or have explicit permission to use. This is a
> friends app where people upload clips — make that rule clear to them.

The **app + backend are already wired** for this (see "How the app uses it" below). What
remains is **on this machine**: install the nodes, train a voice, build + export the
clone workflow, and set a few env vars. Until you do, the feature stays hidden in the app
(`GET /api/voices` returns `{ enabled: false }`).

---

## 1. Train a voice model (once per person — external to ComfyUI)

RVC training is **not** done in ComfyUI. Use **Applio** (actively maintained RVC fork with
a UI, CLI, and built-in vocal isolation): <https://github.com/IAHispano/Applio>.

1. Collect **10+ minutes of clean, isolated vocals** of the target (no music, no reverb,
   one voice). Applio's UVR tab can isolate vocals from existing recordings.
2. In Applio: **Preprocess → Extract → Train**. Output is two files per voice:
   - `<name>.pth`  — the model
   - `<name>.index` — timbre retrieval index
3. Keep the originals somewhere safe; you'll copy the `.pth`/`.index` into ComfyUI next.

so-vits-svc-fork is an alternative (slightly better for singing, heavier/fussier). If you
use it, the wiring below is the same idea — only the node names differ.

## 2. Install the ComfyUI custom nodes

In ComfyUI → **Manager → Install Custom Nodes**, install:

- A **stem-separation** node (Demucs / UVR) — to split ACE's mix into vocal + instrumental.
- An **RVC inference** node — to apply the `.pth` to the vocal stem.

Pick currently-maintained packs (check stars/last-commit in the Manager). After installing,
**restart ComfyUI**, then copy your trained `<name>.pth` (and `.index`) into the folder the
RVC node loads models from (commonly `ComfyUI/models/rvc/` or the node's own `weights/` —
check the node's README). Remember this path; it becomes `VOICES_DIR` below.

## 3. Build + export the clone workflow

Open your **Music AI** workflow in ComfyUI and add the subgraph **after `VAEDecodeAudio`**
(the node feeding the current `SaveAudioMP3`, id 107):

1. `VAEDecodeAudio` AUDIO → **separation node** → `vocals` + `instrumental`
2. `vocals` + your **RVC node** (select the `.pth`, set transpose/index-rate/protect) → cloned vocal
3. cloned vocal + `instrumental` → **`AudioMerge`** (already in your install) → **`SaveAudioMP3`**
4. Leave the ACE-Step half (nodes 94 / 98 / 3) exactly as is.

Save it as a **separate** workflow, e.g. `Music AI - Clone`, then export + convert it to a
**second** API template:

```bash
cd ~/comfy/music-app
node scripts/convert-workflow.mjs "/home/raveuk/comfy/ComfyUI/user/default/workflows/Music AI - Clone.json" workflow.clone.api.json
cp workflow.clone.api.json server/workflow.clone.api.json
```

Open `server/workflow.clone.api.json` and note two ids (the converter prints the node map):
- the **RVC node** id, and the input field on it that picks the model (e.g. `model`)
- the **final `SaveAudioMP3`** id (it's now after the remix, so likely a new id)

## 4. Configure the backend (env)

Add to `server/.env.local`:

```
# folder the RVC node loads .pth voices from — also what the app lists in its dropdown
VOICES_DIR=/home/raveuk/comfy/ComfyUI/models/rvc

# from server/workflow.clone.api.json (step 3)
RVC_CLONE_TEMPLATE=workflow.clone.api.json
RVC_NODE_ID=<id of the RVC node>
RVC_MODEL_FIELD=model           # the RVC node's model-select input name
RVC_SAVE_NODE_ID=<id of the final SaveAudioMP3 in the clone graph>
```

Restart the backend. `GET /api/voices` should now return `enabled: true` with your voices,
and the app's Create screen shows the **🎤 Clone a voice** toggle + picker.

---

## How the app uses it (already built)

- `GET /api/voices` → `{ enabled, voices: [{ file, name }] }`. `enabled` is true only when
  the clone template is configured **and** at least one `.pth` exists in `VOICES_DIR`.
- Create screen: when enabled, a **🎤 Clone a voice** toggle + dropdown appear. Picking a
  voice sends `voiceModel: "<name>.pth"` to `POST /api/generate`.
- `server/lib/workflow.js` `buildGraph()`: if a `voiceModel` is sent **and** cloning is
  configured, it uses `workflow.clone.api.json` instead of the normal template and sets the
  RVC node's model field to the chosen `.pth`. Otherwise it behaves exactly as before, so
  non-clone songs never touch RVC.
- The chosen voice is stored on the track and shown in the Library detail sheet (🎤 Voice).

## Notes / gotchas

- **GPU/time:** cloning adds separation + RVC passes on top of ACE-Step, so expect each
  clone job to take noticeably longer. The progress bar tracks ACE-Step's sampler; the
  RVC/separation tail will sit near 100% until the file is saved.
- **Per-person training** is the cost: one `.pth` per voice, ~10+ min of clean vocals each.
- If you'd rather not train, **Seed-VC** (zero-shot from a short reference clip) swaps into
  step 2's RVC node with the same app wiring — only the ComfyUI node changes.
- The two ACE node-id assumptions (94/98/3 identical across both templates) hold as long as
  you build the clone workflow by extending the original. If you rebuild from scratch and
  ids change, update the constants in `server/lib/workflow.js`.
