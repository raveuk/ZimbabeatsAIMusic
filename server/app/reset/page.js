"use client";
import { useEffect, useState } from "react";

// Reset page opened from the email link, e.g. /reset?token=abc.
// LAN-only: works when the phone is on the same Wi-Fi as this server.
export default function ResetPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState({ kind: "idle" }); // idle | busy | done | error

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (password.length < 6) return setState({ kind: "error", msg: "Password must be at least 6 characters." });
    if (password !== confirm) return setState({ kind: "error", msg: "Passwords don't match." });
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setState({ kind: "done" });
    } catch (err) {
      setState({ kind: "error", msg: err.message });
    }
  }

  const box = { maxWidth: 360, margin: "60px auto", fontFamily: "system-ui, sans-serif" };
  const input = { width: "100%", padding: 12, fontSize: 16, marginBottom: 12, boxSizing: "border-box" };

  if (state.kind === "done") {
    return (
      <div style={box}>
        <h2>✅ Password updated</h2>
        <p>You can now log in with your new password in the AI Music app.</p>
      </div>
    );
  }

  return (
    <div style={box}>
      <h2>🎵 Reset your password</h2>
      {!token && <p style={{ color: "#b00" }}>Missing reset token — open the link from your email again.</p>}
      <form onSubmit={submit}>
        <input
          style={input}
          type="password"
          placeholder="New password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          style={input}
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {state.kind === "error" && <p style={{ color: "#b00" }}>{state.msg}</p>}
        <button type="submit" disabled={!token || state.kind === "busy"} style={{ ...input, cursor: "pointer" }}>
          {state.kind === "busy" ? "Saving…" : "Set new password"}
        </button>
      </form>
    </div>
  );
}
