// Tiny status page so hitting the server root in a browser confirms it's up.
export default function Home() {
  return (
    <main>
      <h1>🎵 AI Music Server</h1>
      <p>API backend for the ComfyUI music workflow. The app talks to these endpoints:</p>
      <ul>
        <li><code>POST /api/auth/register</code> — {"{ email, password }"}</li>
        <li><code>POST /api/auth/login</code> — {"{ email, password }"} → {"{ token }"}</li>
        <li><code>POST /api/generate</code> — auth; {"{ style, lyrics, duration, seed?, bpm?, key? }"}</li>
        <li><code>GET /api/jobs</code> — auth; list your tracks</li>
        <li><code>GET /api/jobs/:id</code> — auth; one track's status</li>
        <li><code>GET /api/audio/:id</code> — auth; stream the mp3</li>
      </ul>
      <p>Send the token as <code>Authorization: Bearer &lt;token&gt;</code>.</p>
    </main>
  );
}
