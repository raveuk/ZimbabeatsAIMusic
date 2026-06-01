// Thin client for the ComfyUI HTTP API.
const COMFY_URL = process.env.COMFY_URL || "http://127.0.0.1:8188";

// Submit a graph; returns { prompt_id } or throws with ComfyUI's validation error.
export async function submitPrompt(graph) {
  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: graph }),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error("ComfyUI rejected the workflow");
    err.detail = body;
    throw err;
  }
  return body; // { prompt_id, number, node_errors }
}

// Fetch the history entry for a prompt, or null if not finished/known yet.
export async function getHistory(promptId) {
  const res = await fetch(`${COMFY_URL}/history/${promptId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data[promptId] ?? null;
}

// Where is this job in the queue? Returns { running, pending } counts/flags.
export async function getQueueState(promptId) {
  const res = await fetch(`${COMFY_URL}/queue`);
  if (!res.ok) return { running: false, position: null };
  const q = await res.json();
  const isRunning = (q.queue_running || []).some((x) => x[1] === promptId);
  const pendingIdx = (q.queue_pending || []).findIndex((x) => x[1] === promptId);
  return { running: isRunning, position: pendingIdx >= 0 ? pendingIdx + 1 : null };
}

// Stream the generated audio file back to the caller.
export async function fetchAudio(filename, subfolder) {
  const url = new URL(`${COMFY_URL}/view`);
  url.searchParams.set("filename", filename);
  if (subfolder) url.searchParams.set("subfolder", subfolder);
  url.searchParams.set("type", "output");
  return fetch(url); // caller streams res.body
}

// Derive a coarse status + output info from a history entry.
export function summarizeHistory(entry) {
  if (!entry) return { status: "queued", output: null };
  const statusStr = entry.status?.status_str;
  if (statusStr === "error") return { status: "error", output: null, error: entry.status };
  const saved = entry.outputs && Object.values(entry.outputs).find((o) => o.audio?.length);
  if (saved) {
    const a = saved.audio[0];
    return { status: "done", output: { filename: a.filename, subfolder: a.subfolder } };
  }
  return { status: "running", output: null };
}
