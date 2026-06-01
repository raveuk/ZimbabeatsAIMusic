#!/usr/bin/env node
// Machine-translate the English block of web/i18n/translations.ts into a list
// of target languages using Ollama. Appends new locale blocks to the file
// and updates the Language type union. Run from repo root:
//   node scripts/translate-ui.mjs
//
// Strategy:
//   * Extract the `en: { ... }` block by regex and eval its body into JS.
//   * Batch ~25 entries per Ollama call (single prompt asks the model to
//     return a JSON object with the SAME keys, translated values).
//   * Preserve {placeholders} and \n exactly. Validate output schema; on a
//     bad batch, retry once, then fall back to English.

import fs from "node:fs";
import path from "node:path";

const ROOT  = path.dirname(new URL(import.meta.url).pathname);
const FILE  = path.join(ROOT, "..", "web", "i18n", "translations.ts");
const MODEL = process.env.OLLAMA_MODEL || "gemma4:31b-fast";
const URL_  = process.env.OLLAMA_URL   || "http://127.0.0.1:11434";

// Languages to add — code + human-readable name + tag for Ollama.
const TARGETS = [
  { code: "es", name: "Spanish (Spain)" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese (Brazil)" },
  { code: "it", name: "Italian" },
  { code: "ar", name: "Arabic" },
  { code: "ru", name: "Russian" },
  { code: "hi", name: "Hindi" },
];

const BATCH = 25;

// ---------------------------------------------------------------------------
// 1. Pull the en block out of translations.ts and turn it into a JS object.
// ---------------------------------------------------------------------------
const source = fs.readFileSync(FILE, "utf8");
const enMatch = source.match(/\n  en: ({[\s\S]*?\n  }),\n  zh:/);
if (!enMatch) {
  console.error("Couldn't find en block.");
  process.exit(1);
}
// Eval its body — safe enough here, it's our own source file.
// eslint-disable-next-line no-eval
const enObj = (0, eval)("(" + enMatch[1] + ")");
const keys  = Object.keys(enObj);
console.log(`Found ${keys.length} keys.`);

// ---------------------------------------------------------------------------
// 2. Ollama batch translator.
// ---------------------------------------------------------------------------
async function askOllama(prompt) {
  const res = await fetch(`${URL_}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, stream: false, options: { temperature: 0.2 } }),
  });
  const data = await res.json();
  return data.response || "";
}

function buildPrompt(targetName, slice) {
  // We pass keys+English values as JSON; ask for the same JSON with values translated.
  const sample = {};
  for (const [k, v] of slice) sample[k] = v;
  return [
    `Translate the JSON object's *values* into ${targetName}. Do not translate keys.`,
    `Preserve placeholders like {title}, {url}, {creator} EXACTLY as-is.`,
    `Preserve newlines (\\n) and quotation style.`,
    `Use natural, concise, idiomatic ${targetName} — short labels stay short.`,
    `Output JSON only, no prose, no fences.\n`,
    JSON.stringify(sample, null, 2),
  ].join("\n");
}

function extractJSON(text) {
  // Strip Markdown fences if present.
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "");
  // Heuristic: take the first { ... last }
  const first = t.indexOf("{");
  const last  = t.lastIndexOf("}");
  if (first < 0 || last < 0) return null;
  try { return JSON.parse(t.slice(first, last + 1)); }
  catch { return null; }
}

async function translateBatch(targetName, slice) {
  const prompt = buildPrompt(targetName, slice);
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askOllama(prompt);
    const obj = extractJSON(raw);
    if (obj && typeof obj === "object") return obj;
    console.warn(`  [${targetName}] retry attempt ${attempt + 1}…`);
  }
  // Fall back to English for this batch.
  return Object.fromEntries(slice);
}

async function translateAll(target) {
  console.log(`\n=== ${target.code} (${target.name}) ===`);
  const out = {};
  for (let i = 0; i < keys.length; i += BATCH) {
    const slice = keys.slice(i, i + BATCH).map((k) => [k, enObj[k]]);
    process.stdout.write(`  ${i + slice.length}/${keys.length}\r`);
    const part = await translateBatch(target.name, slice);
    // Keep only known keys (model may hallucinate). Empty values fall back to English.
    for (const [k] of slice) out[k] = (part[k] && String(part[k])) || enObj[k];
  }
  console.log(`  done.`);
  return out;
}

// ---------------------------------------------------------------------------
// 3. Serialize back into TypeScript object literal source.
// ---------------------------------------------------------------------------
function serialize(localeCode, obj) {
  const lines = [`  ${localeCode}: {`];
  for (const k of keys) {
    const v = obj[k] ?? enObj[k];
    lines.push(`    ${k}: ${JSON.stringify(v)},`);
  }
  lines.push(`  },`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 4. Main: translate each, splice into the file before the closing `};`.
// ---------------------------------------------------------------------------
(async () => {
  const newBlocks = [];
  for (const t of TARGETS) {
    const obj = await translateAll(t);
    newBlocks.push(serialize(t.code, obj));
  }

  const updated = source.replace(
    /(\n  ko: {[\s\S]*?\n  }),?\n};\n+export type TranslationKey/,
    (_m, koBlock) => `${koBlock},\n${newBlocks.join("\n")}\n};\n\nexport type TranslationKey`,
  );

  // Also update the Language type to include the new codes.
  const langUnion = ["en", "zh", "ja", "ko", ...TARGETS.map((t) => t.code)]
    .map((c) => `'${c}'`)
    .join(" | ");
  const updated2 = updated.replace(
    /export type Language = [^;]+;/,
    `export type Language = ${langUnion};`,
  );

  fs.writeFileSync(FILE, updated2);
  console.log(`\nWrote ${TARGETS.length} new locales into ${FILE}.`);
})();
