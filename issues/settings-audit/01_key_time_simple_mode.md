# Issue 01 — Key & Time dropdowns (Simple mode) don't change

## Symptom
User picks a Key or Time signature in Simple mode; the dropdown snaps back to
"Auto" and nothing changes.

## Root cause
Native `<select>` with a malformed onChange handler:
```jsx
<select value={keyScale} onChange={setKeyScale}>      // WRONG
```
A native select's `onChange` passes the **event object**, not the value. So
`keyScale` became `[object Object]`, matched no `<option>`, and the select reset.

The Custom-mode copy of the same controls (CreatePanel.tsx:2270/2283) was already
correct (`onChange={(e) => setKeyScale(e.target.value)}`), which is why it looked
inconsistent.

## Origin
Pre-existing since commit `a9a18c8` (2026-06-01, initial upstream import). NOT
introduced this session.

## Backend status
Key/Time were ALWAYS wired on the backend: `workflow.js:101-102` writes
`p.keyscale` / `p.timesignature` into the TextEncodeAceStepAudio1.5 node. Only the
UI layer was broken.

## Fix
CreatePanel.tsx lines ~1622, ~1635:
```jsx
onChange={(e) => setKeyScale(e.target.value)}
onChange={(e) => setTimeSignature(e.target.value)}
```

## Verification
Pick a Key/Time in Simple mode → value sticks → reaches the graph's keyscale/
timesignature inputs. Build passed.
