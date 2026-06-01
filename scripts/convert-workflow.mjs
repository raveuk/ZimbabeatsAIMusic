#!/usr/bin/env node
// Convert a ComfyUI UI-format workflow into API ("prompt") format.
//
// The UI format stores each node's editable values in `widgets_values` (a flat
// array) and its connections in `inputs[].link` (referencing the top-level
// `links` table). The API format ComfyUI's /prompt endpoint expects is:
//   { "<nodeId>": { "class_type": "...", "inputs": { name: value | [srcId, slot] } } }
//
// To map widgets_values onto named inputs we need each node's input *order*,
// which we read from the live server's /object_info. PrimitiveNodes (and a few
// other UI-only helper nodes) don't exist in the API graph: their value is
// inlined into every node they feed.
//
// Usage: node convert-workflow.mjs <input-ui.json> <output-api.json> [comfyUrl]

import fs from "node:fs";

const [, , inPath, outPath, comfyUrlArg] = process.argv;
const COMFY = comfyUrlArg || "http://127.0.0.1:8188";

if (!inPath || !outPath) {
  console.error("usage: convert-workflow.mjs <input-ui.json> <output-api.json> [comfyUrl]");
  process.exit(1);
}

// UI-only node types that carry a single value and get inlined into consumers.
const PRIMITIVE_TYPES = new Set(["PrimitiveNode", "PrimitiveInt", "PrimitiveFloat",
  "PrimitiveString", "PrimitiveStringMultiline", "PrimitiveBoolean", "Note", "MarkdownNote", "Reroute"]);

const ui = JSON.parse(fs.readFileSync(inPath, "utf8"));
const objectInfo = await (await fetch(`${COMFY}/object_info`)).json();

const nodes = ui.nodes;
const byId = new Map(nodes.map((n) => [n.id, n]));

// links: [linkId, originNodeId, originSlot, targetNodeId, targetSlot, type]
const linkById = new Map((ui.links || []).map((l) => [l[0], l]));

// Scalar widget types; everything else that's a bare string is a connection
// (link) type like MODEL / CONDITIONING / LATENT. COMBO inputs are arrays.
const WIDGET_SCALARS = new Set(["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"]);

// Ordered input descriptors for a class: {name, isWidget, control}.
function inputDescriptors(classType) {
  const info = objectInfo[classType];
  if (!info) return null;
  const req = info.input?.required || {};
  const opt = info.input?.optional || {};
  const out = [];
  for (const [name, spec] of [...Object.entries(req), ...Object.entries(opt)]) {
    const typ = Array.isArray(spec) ? spec[0] : spec;
    const opts = Array.isArray(spec) && spec[1] && typeof spec[1] === "object" ? spec[1] : {};
    const isWidget = Array.isArray(typ) || WIDGET_SCALARS.has(typ);
    out.push({ name, isWidget, control: !!opts.control_after_generate });
  }
  return out;
}

// Resolve a Reroute/primitive chain back to the real producing node + slot.
function resolveSource(originId, originSlot) {
  let node = byId.get(originId);
  let slot = originSlot;
  // Reroutes pass through their single input.
  while (node && node.type === "Reroute") {
    const inLink = node.inputs?.[0]?.link;
    if (inLink == null) return null;
    const l = linkById.get(inLink);
    if (!l) return null;
    node = byId.get(l[1]);
    slot = l[2];
  }
  if (!node) return null;
  return { node, slot };
}

// For a node, build {name: value} for its widget inputs by consuming
// widgets_values positionally over the widget-typed inputs (in declared order).
// widgets_values contains an entry for every widget even when that input is
// also wired to a link, plus one extra trailing entry after each
// control_after_generate widget (the "fixed"/"randomize" control). Link-fed
// inputs are overridden afterwards in the main loop.
function widgetInputs(node) {
  const descs = inputDescriptors(node.type);
  if (!descs) throw new Error(`No object_info for class_type "${node.type}" (node ${node.id})`);
  const vals = node.widgets_values || [];
  const out = {};
  let i = 0;
  for (const d of descs) {
    if (!d.isWidget) continue;
    if (i < vals.length) out[d.name] = vals[i];
    i++;
    if (d.control) i++; // skip the control_after_generate value
  }
  return out;
}

// Get the inlined value a primitive node outputs (its first widget value).
function primitiveValue(node) {
  return (node.widgets_values || [])[0];
}

const api = {};

for (const node of nodes) {
  if (PRIMITIVE_TYPES.has(node.type)) continue; // inlined / dropped
  if (node.mode === 2 || node.mode === 4) continue; // muted / bypassed

  const inputs = widgetInputs(node);

  // Add link-based inputs, resolving primitives to inline values.
  for (const inp of node.inputs || []) {
    if (inp.link == null) continue;
    const l = linkById.get(inp.link);
    if (!l) continue;
    const src = resolveSource(l[1], l[2]);
    if (!src) continue;
    if (PRIMITIVE_TYPES.has(src.node.type)) {
      inputs[inp.name] = primitiveValue(src.node); // inline the constant
    } else {
      inputs[inp.name] = [String(src.node.id), src.slot]; // [nodeId, outputSlot]
    }
  }

  api[String(node.id)] = { class_type: node.type, inputs, _meta: { title: node.title || node.type } };
}

fs.writeFileSync(outPath, JSON.stringify(api, null, 2));
console.log(`Wrote ${outPath} with ${Object.keys(api).length} nodes.`);
