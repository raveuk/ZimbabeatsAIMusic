# Issue 05 — Hidden duplicate Variations input had broken handler

## Symptom
None visible (the element is inside a `display:none` block). Found during the
full audit.

## Root cause
A leftover hidden native `<input type="range">` for batchSize used the same
broken pattern as Key/Time:
```jsx
<input ... onChange={setBatchSize}>   // event object, not value
```
Dead code (never rendered), but broken and confusing.

## Fix
CreatePanel.tsx (~line 1662):
```jsx
onChange={(e) => setBatchSize(Number(e.target.value))}
```
Left the element hidden (the visible Variations control is an EditableSlider that
already works); just corrected the handler for hygiene so no broken pattern lingers.

## Verification
Build passed. No functional change (element stays hidden); removes a latent bug.
