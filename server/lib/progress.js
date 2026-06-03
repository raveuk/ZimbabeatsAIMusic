// Live render progress, by subscribing once to ComfyUI's WebSocket.
// ComfyUI broadcasts execution + progress events; we keep one long-lived
// socket and remember the latest step count per prompt.
//
// IMPORTANT: ComfyUI moved from `"progress"` events (old) to `"progress_state"`
// events (current, ~ComfyUI v0.3.50+). The new format also targets a specific
// client_id rather than broadcasting — so /api/generate MUST submit prompts
// WITH the matching client_id in the request body (`{prompt: graph, client_id}`),
// otherwise the progress events are sent to whichever socket connected last
// (usually the user's browser tab) and our subscriber sees nothing. submitPrompt
// in lib/comfy.js handles that.
export const PROGRESS_CLIENT_ID = "music-app-progress";
const WS_URL = (process.env.COMFY_URL || "http://127.0.0.1:8188").replace(/^http/, "ws") + `/ws?clientId=${PROGRESS_CLIENT_ID}`;

// Survive Next.js dev hot-reloads: keep state + socket on globalThis.
const g = globalThis;
const S = g.__musicProgress ?? (g.__musicProgress = { map: new Map(), current: null, ws: null });

function connect() {
  if (S.ws && (S.ws.readyState === 0 || S.ws.readyState === 1)) return; // connecting/open
  let ws;
  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    console.warn("[progress.js] WebSocket constructor failed:", e?.message);
    return;
  }
  console.log("[progress.js] connecting to", WS_URL);
  S.ws = ws;
  ws.addEventListener("open", () => console.log("[progress.js] connected"));

  ws.addEventListener("message", (ev) => {
    if (typeof ev.data !== "string") return; // ignore binary preview frames
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const { type, data } = msg;
    if (!data) return;

    if (type === "execution_start") {
      S.current = data.prompt_id ?? S.current;
    } else if (type === "executing") {
      S.current = data.prompt_id ?? S.current;
      if (data.node == null && data.prompt_id) S.map.delete(data.prompt_id); // that prompt finished
    } else if (type === "progress") {
      // Legacy ComfyUI shape — kept as a fallback for older servers.
      const pid = data.prompt_id ?? S.current;
      if (pid && data.max) S.map.set(pid, { value: data.value, max: data.max });
    } else if (type === "progress_state") {
      // Current ComfyUI shape (v0.3.50+):
      //   { prompt_id, nodes: { "<node_id>": { value, max, state, ... }, ... } }
      // Pick the running node with the biggest progress so a multi-stage
      // workflow (e.g. cover prompt + audio prompt) shows the most useful %.
      const pid = data.prompt_id ?? S.current;
      const nodes = data.nodes && typeof data.nodes === "object" ? Object.values(data.nodes) : [];
      let best = null;
      for (const n of nodes) {
        if (!n || !n.max) continue;
        const pct = n.value / n.max;
        if (!best || pct > best.value / best.max) best = { value: n.value, max: n.max };
      }
      if (pid && best) S.map.set(pid, best);
    } else if (type === "execution_success" || type === "execution_error" || type === "execution_interrupted") {
      const pid = data.prompt_id ?? S.current;
      if (pid) S.map.delete(pid);
    }
  });
  ws.addEventListener("close", () => { S.ws = null; setTimeout(connect, 2000); });
  ws.addEventListener("error", () => { try { ws.close(); } catch {} });
}

// Latest progress for a prompt, or null if unknown. { value, max, percent }.
export function progressFor(promptId) {
  connect();
  const p = promptId && S.map.get(promptId);
  if (!p || !p.max) return null;
  return { value: p.value, max: p.max, percent: Math.min(100, Math.round((p.value / p.max) * 100)) };
}

connect(); // start subscribing as soon as this module loads
