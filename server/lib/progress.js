// Live render progress, by subscribing once to ComfyUI's WebSocket.
// ComfyUI broadcasts execution + progress events to every connected client, so
// we keep one long-lived socket and remember the latest step count per prompt.
const WS_URL = (process.env.COMFY_URL || "http://127.0.0.1:8188").replace(/^http/, "ws") + "/ws?clientId=music-app-progress";

// Survive Next.js dev hot-reloads: keep state + socket on globalThis.
const g = globalThis;
const S = g.__musicProgress ?? (g.__musicProgress = { map: new Map(), current: null, ws: null });

function connect() {
  if (S.ws && (S.ws.readyState === 0 || S.ws.readyState === 1)) return; // connecting/open
  let ws;
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    return;
  }
  S.ws = ws;

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
      // ComfyUI may omit prompt_id on progress; attribute it to the running prompt.
      const pid = data.prompt_id ?? S.current;
      if (pid && data.max) S.map.set(pid, { value: data.value, max: data.max });
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
