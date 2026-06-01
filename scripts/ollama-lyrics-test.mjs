#!/usr/bin/env node
// Wire OllamaConnectivityV2 -> OllamaGenerateV2 -> node 94 `lyrics`, then run
// the workflow through ComfyUI to prove the LLM-writes-lyrics chain works.
import fs from "node:fs";

const COMFY = "http://127.0.0.1:8188";
const OLLAMA = "http://127.0.0.1:11434";
const MODEL = process.argv[2] || "hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:q4_K_M";
const THEME = process.argv[3] || "An upbeat pop song about summer road trips with friends";
const SYSTEM =
  "You are a professional songwriter. Output ONLY song lyrics using [verse], [chorus], [bridge] section tags. No title, no commentary.";

// 1) Show what the model writes (direct Ollama call, same prompt as the node).
const og = await (await fetch(`${OLLAMA}/api/generate`, {
  method: "POST",
  body: JSON.stringify({ model: MODEL, system: SYSTEM, prompt: THEME, stream: false }),
})).json();
console.log("=== sample lyrics from", MODEL, "===\n" + (og.response || JSON.stringify(og)).slice(0, 600) + "\n");

// 2) Build the wired graph.
const g = JSON.parse(fs.readFileSync(new URL("../workflow.api.json", import.meta.url)));
g["200"] = { class_type: "OllamaConnectivityV2", inputs: { url: OLLAMA, model: MODEL, keep_alive: 5, keep_alive_unit: "minutes" } };
g["201"] = { class_type: "OllamaGenerateV2", inputs: { system: SYSTEM, prompt: THEME, think: false, keep_context: false, format: "text", connectivity: ["200", 0] } };
g["94"].inputs.lyrics = ["201", 0]; // <- the connection you were trying to make in the UI
g["98"].inputs.seconds = 20;
g["94"].inputs.duration = 20;
g["107"].inputs.filename_prefix = `music_app/ollama_test_${Date.now()}`;

// 3) Submit + poll.
const res = await fetch(`${COMFY}/prompt`, { method: "POST", body: JSON.stringify({ prompt: g }) });
const body = await res.json();
if (!res.ok) { console.error("SUBMIT FAILED:", JSON.stringify(body, null, 2)); process.exit(1); }
const id = body.prompt_id;
console.log("submitted prompt_id:", id);

const deadline = Date.now() + 6 * 60 * 1000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 2000));
  const h = await (await fetch(`${COMFY}/history/${id}`)).json();
  const e = h[id];
  if (!e) { process.stdout.write("."); continue; }
  if (e.status?.status_str === "error") { console.error("\nWORKFLOW ERROR:", JSON.stringify(e.status, null, 2)); process.exit(1); }
  if (e.outputs) { console.log("\nDONE:", JSON.stringify(e.outputs, null, 2)); process.exit(0); }
}
console.error("\nTIMED OUT"); process.exit(1);
