# Patches

## applio-no-pedalboard.patch
Makes Applio's `pedalboard` imports lazy, so it loads on CPUs without AVX2
(e.g. this machine's Xeon E5-2697 v2). Without this patch, `app.py` crashes on
import with `Illegal instruction (core dumped)` while loading `pedalboard`.

**Effect:** training works fully. The realtime voice-changer tab and the
post-processing FX (Reverb/Chorus/PitchShift/etc.) in the Inference tab will
still crash if used — leave them off.

**Apply (after a fresh `git clone` or after `git pull` clobbers the local edits):**
```bash
cd ~/Applio
git apply ~/comfy/music-app/patches/applio-no-pedalboard.patch
```

Confirm it took: `git status` should show the two files as modified, or
```bash
./.venv/bin/python -c "import app; print('ok')"
```
should print `ok` instead of dying.
