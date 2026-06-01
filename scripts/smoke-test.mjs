#!/usr/bin/env node
// Submit the converted workflow to ComfyUI and confirm an mp3 is produced.
import fs from "node:fs";
const COMFY = process.argv[2] || "http://127.0.0.1:8188";
const g = JSON.parse(fs.readFileSync(new URL("../workflow.api.json", import.meta.url)));

// Patch to a short, fast job.
g["98"].inputs.seconds = 30;
g["94"].inputs.duration = 30;
const prefix = `music_app/smoke_${Date.now()}`;
g["107"].inputs.filename_prefix = prefix;

const clientId = "smoke-" + Math.random().toString(36).slice(2);
const res = await fetch(`${COMFY}/prompt`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: g, client_id: clientId }),
});
const body = await res.json();
if (!res.ok) {
  console.error("SUBMIT FAILED:", JSON.stringify(body, null, 2));
  process.exit(1);
}
const promptId = body.prompt_id;
console.log("submitted prompt_id:", promptId);

const deadline = Date.now() + 5 * 60 * 1000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 2000));
  const h = await (await fetch(`${COMFY}/history/${promptId}`)).json();
  const entry = h[promptId];
  if (!entry) { process.stdout.write("."); continue; }
  const status = entry.status?.status_str;
  if (status === "error") {
    console.error("\nWORKFLOW ERROR:", JSON.stringify(entry.status, null, 2));
    process.exit(1);
  }
  if (entry.outputs) {
    console.log("\nDONE. outputs:", JSON.stringify(entry.outputs, null, 2));
    process.exit(0);
  }
}
console.error("\nTIMED OUT waiting for result");
process.exit(1);
