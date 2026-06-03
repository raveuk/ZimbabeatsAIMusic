import { auth as firebaseAuth } from './firebase';

// API base — talks to our Next.js backend at api.zimbabeats.com in prod.
// Override via VITE_API_BASE for local development (e.g. http://127.0.0.1:3000).
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || 'https://api.zimbabeats.com';

// JSON serializer that drops circular refs + non-serializable values (DOM
// nodes, React fibers, AbortControllers, etc.) instead of throwing. Keeps
// fetches from blowing up with 'cyclic object value' when an event object
// or ref accidentally leaks into the request body.
function safeStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object') {
      // Skip well-known non-serializable shapes outright.
      if (
        v instanceof Element ||
        v instanceof Event ||
        v instanceof AbortController ||
        (typeof File !== 'undefined' && v instanceof File) ||
        (typeof Blob !== 'undefined' && v instanceof Blob)
      ) return undefined;
      if (seen.has(v as object)) return undefined;
      seen.add(v as object);
    }
    return v;
  });
}

// Resolve audio/cover URL: append our Firebase ID token as ?token=… so the
// native browser <audio>/<img> tags can fetch from our authenticated endpoint
// without needing an Authorization header (which they can't set).
async function withToken(url: string): Promise<string> {
  try {
    const t = await firebaseAuth.currentUser?.getIdToken();
    if (!t) return url;
    return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}`;
  } catch { return url; }
}

export function getAudioUrl(audioUrl: string | undefined | null, songId?: string): string | undefined {
  if (!audioUrl) return undefined;
  // Backend serves audio at /api/audio/<id> — relative paths get prefixed with API_BASE.
  if (audioUrl.startsWith('/')) {
    // Token is appended lazily — components that need it should use getSignedAudioUrl.
    return `${API_BASE}${audioUrl}`;
  }
  return audioUrl;
}

// Like getAudioUrl, but appends a fresh Firebase ID token so the <audio>/<img>
// element can authenticate without an Authorization header.
export async function getSignedAudioUrl(audioUrl: string | undefined | null): Promise<string | undefined> {
  const base = getAudioUrl(audioUrl);
  if (!base) return undefined;
  return withToken(base);
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // If no explicit token was passed, pull a fresh Firebase ID token from the
  // signed-in user. SDK auto-refreshes the token when it's near expiry, so we
  // don't need to manage that ourselves.
  let authToken = token;
  if (authToken === undefined) {
    try { authToken = (await firebaseAuth.currentUser?.getIdToken()) ?? null; } catch { authToken = null; }
  }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? safeStringify(body) : undefined,
    // credentials: 'include' is for cookies — our backend uses bearer tokens
    // and CORS would require Access-Control-Allow-Credentials. Drop it.
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const errorMessage = error.error || error.message || 'Request failed';
    throw new Error(`${response.status}: ${errorMessage}`);
  }

  return response.json();
}

// Auth API (simplified - username only)
export interface User {
  id: string;
  username: string;
  isAdmin?: boolean;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  createdAt?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// Adapt our backend's user row to our upstream UI's expected User shape. Our backend
// returns { id, email, role, disabled, track_quota, firebase_uid }; the upstream UI's
// UI expects { id, username, isAdmin, ... }. Username is derived from the
// part of the email before the '@'.
interface BackendUser {
  id: number;
  email: string;
  role: 'admin' | 'user';
  disabled?: 0 | 1;
  track_quota?: number | null;
}
function toFspeciiUser(u: BackendUser): User {
  return {
    id: String(u.id),
    username: u.email.split('@')[0] || 'user',
    isAdmin: u.role === 'admin',
  };
}

export const authApi = {
  // Fetch the current user from our /api/me endpoint. The Firebase ID token is
  // attached automatically by the api() helper. Returns null if not signed in.
  me: async (_token?: string): Promise<{ user: User }> => {
    const { user } = await api<{ user: BackendUser }>('/api/me');
    return { user: toFspeciiUser(user) };
  },

  // Compatibility stubs — the upstream UI calls these but on our app the entire
  // auth lifecycle is handled by Firebase (sign-in, sign-up, sign-out). The
  // AuthContext below short-circuits these and never calls the API path.
  auto: async (): Promise<AuthResponse> => {
    const { user } = await authApi.me();
    const token = (await firebaseAuth.currentUser?.getIdToken()) || '';
    return { user, token };
  },
  setup:           async (_u: string): Promise<AuthResponse> => { throw new Error('auth handled by Firebase'); },
  logout:          async (): Promise<{ success: boolean }> => ({ success: true }),
  refresh:         async (): Promise<AuthResponse> => authApi.auto(),
  updateUsername:  async (_u: string, _t: string): Promise<AuthResponse> => { throw new Error('username changes via Firebase profile'); },
};

// Songs API
export interface Song {
  id: string;
  title: string;
  lyrics: string;
  style: string;
  caption?: string;
  cover_url?: string;
  audio_url?: string;
  audioUrl?: string;
  duration?: number;
  bpm?: number;
  key_scale?: string;
  time_signature?: string;
  tags: string[];
  is_public: boolean;
  like_count?: number;
  view_count?: number;
  user_id?: string;
  created_at: string;
  creator?: string;
  creator_avatar?: string;
  ditModel?: string;
  generation_params?: any;
}

// Our backend's track shape, as returned by /api/jobs (and /api/jobs/:id).
// See server/lib/tracks.js → publicTrack(). audioUrl/coverUrl are relative
// paths like "/api/audio/42" which need API_BASE prepended for the browser.
interface BackendTrack {
  id: number;
  title: string | null;
  status: 'queued' | 'running' | 'done' | 'error';
  params: {
    style?: string;
    lyrics?: string;
    theme?: string;
    duration?: number;
    bpm?: number;
    key?: string;
    language?: string;
    timesignature?: string;
    quality?: string;
    voiceModel?: string | null;
    writeLyrics?: boolean;
    [k: string]: unknown;
  };
  createdAt: string;
  queuePosition: number | null;
  progress: { percent?: number } | null;
  audioUrl: string | null;
  coverUrl: string | null;
  coverPending: boolean;
}

// Map our /api/jobs track row to the upstream Song shape. the upstream UI reads
// BOTH camelCase and snake_case keys for some fields (audio_url AND audioUrl,
// like_count AND likeCount, etc.) — we populate both for safety.
function toFspeciiSong(t: BackendTrack, currentUser?: User | null): Song {
  const id = String(t.id);
  const audioRel = t.audioUrl;
  const coverRel = t.coverUrl;
  // Pre-sign URLs with the current token so <audio>/<img> tags can hit our
  // authenticated endpoints without setting Authorization headers (browsers
  // don't expose that for native media loaders).
  const audioSigned = audioRel ? withSignedToken(`${API_BASE}${audioRel}`) : undefined;
  const coverSigned = coverRel ? withSignedToken(`${API_BASE}${coverRel}`) : undefined;
  return {
    id,
    title: t.title || `Track #${t.id}`,
    lyrics: String(t.params.lyrics || ''),
    style: String(t.params.style || ''),
    caption: undefined,
    cover_url: coverSigned,
    audio_url: audioSigned,
    audioUrl:  audioSigned,
    duration: typeof t.params.duration === 'number' ? t.params.duration : undefined,
    bpm: typeof t.params.bpm === 'number' ? t.params.bpm : undefined,
    key_scale: typeof t.params.key === 'string' ? t.params.key : undefined,
    time_signature: typeof t.params.timesignature === 'string' ? t.params.timesignature : undefined,
    tags: [], // we don't store tag arrays — style string carries everything
    is_public: false, // we don't expose public sharing yet
    like_count: 0,
    view_count: 0,
    user_id: currentUser?.id,
    creator: currentUser?.username,
    creator_avatar: undefined,
    created_at: t.createdAt,
    generation_params: t.params,
  };
}

let _currentUserCache: User | null = null;
let _currentTokenCache: string | null = null;
export function _setCurrentUserForSongMapper(u: User | null) { _currentUserCache = u; }
export function _setCurrentTokenForSongMapper(t: string | null) { _currentTokenCache = t; }
function ctx() { return _currentUserCache; }

// Append the current Firebase ID token to a backend URL so vanilla
// <audio>/<img> tags (which can't set Authorization headers) authenticate via
// query string. Picks the right separator (?/&) for existing query params.
function withSignedToken(url: string | undefined): string | undefined {
  if (!url || !_currentTokenCache) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(_currentTokenCache)}`;
}

// Model catalogue — reads the live workflow JSONs on the backend and reports
// the exact files in use. The CreatePanel hydrates its LM Model / UNET /
// cover-checkpoint pickers from this so the UI never drifts from reality.
export interface ConfiguredModel { id: string; file: string; label: string; role?: string }
export const modelsApi = {
  list: async (): Promise<{
    lmModels: ConfiguredModel[];
    unetModels: ConfiguredModel[];
    coverModels: ConfiguredModel[];
    voices?: ConfiguredModel[];
  }> => api('/api/models'),
};

// Standalone lyric-writer endpoint — used by the Create panel's "Write
// lyrics" / "Regenerate" buttons. Hits our backend's /api/lyrics route,
// which is Ollama-backed.
export const lyricsApi = {
  // Non-streaming: wait for full text. Used as a fallback.
  write: async (theme: string, language?: string, thinking?: boolean): Promise<{ lyrics: string }> =>
    api<{ lyrics: string }>('/api/lyrics', { method: 'POST', body: { theme, language, thinking: !!thinking } }),

  // Streaming: invokes onChunk(partialText) repeatedly as Ollama emits tokens.
  // The full transcript is also returned in `lyrics` for callers that just
  // want the final value. Throws on network/auth errors before the first
  // chunk arrives. Stream protocol: NDJSON, one `{ response, done }` per line.
  // `thinking=true` tells the backend to prepend a chain-of-thought planning
  // instruction to the LLM prompt — same model, richer reasoning, ~2× wall
  // time on cloud Gemma.
  writeStream: async (
    theme: string,
    language: string | undefined,
    onChunk: (partial: string) => void,
    thinking?: boolean,
  ): Promise<{ lyrics: string }> => {
    const token = (await firebaseAuth.currentUser?.getIdToken()) ?? null;
    const res = await fetch(`${API_BASE}/api/lyrics?stream=1`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: safeStringify({ theme, language, thinking: !!thinking }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${res.status}: ${detail.slice(0, 200) || 'lyric stream failed'}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // NDJSON: split on newlines, keep last (possibly partial) for next pass.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed) as { response?: string; done?: boolean };
          if (obj.response) {
            accumulated += obj.response;
            onChunk(accumulated);
          }
        } catch { /* malformed line, ignore */ }
      }
    }
    return { lyrics: accumulated.trim() };
  },
};

export const songsApi = {
  // Library list — backed by /api/jobs. Failed rows are filtered out: they
  // can't be played, and the UI treats them as if they were unfinished but
  // available which is misleading.
  getMySongs: async (_token?: string): Promise<{ songs: Song[] }> => {
    const { tracks } = await api<{ tracks: BackendTrack[] }>('/api/jobs');
    return {
      songs: tracks
        .filter((t) => t.status !== 'error')
        .map((t) => toFspeciiSong(t, ctx())),
    };
  },

  // Cross-user discovery: public-only, status='done', newest first.
  getPublicSongs: async (limit = 20, offset = 0): Promise<{ songs: Song[] }> => {
    const { tracks } = await api<{ tracks: (BackendTrack & { creator?: string })[] }>(
      `/api/songs/public?limit=${limit}&offset=${offset}`,
    );
    return { songs: tracks.map((t) => ({ ...toFspeciiSong(t, ctx()), creator: t.creator ?? '' })) };
  },
  getFeaturedSongs: async (): Promise<{ songs: Song[] }> => {
    const { tracks } = await api<{ tracks: (BackendTrack & { creator?: string })[] }>('/api/songs/public/featured');
    return { songs: tracks.map((t) => ({ ...toFspeciiSong(t, ctx()), creator: t.creator ?? '' })) };
  },
  // Likes aren't modelled yet — keep an empty list so the UI shows an empty state.
  getLikedSongs:    async (_token?: string): Promise<{ songs: Song[] }> => ({ songs: [] }),

  getSong: async (id: string, _token?: string | null): Promise<{ song: Song }> => {
    const t = await api<BackendTrack>(`/api/jobs/${encodeURIComponent(id)}`);
    return { song: toFspeciiSong(t, ctx()) };
  },

  getFullSong: async (id: string, _token?: string | null): Promise<{ song: Song; comments: Comment[] }> => {
    const { song } = await songsApi.getSong(id);
    // Comments not supported — empty array keeps the UI happy.
    return { song, comments: [] };
  },

  // Track rows are created server-side by /api/generate. We don't have a
  // direct "createSong" path — this is a no-op compatibility stub.
  createSong: async (_song: Partial<Song>, _token: string): Promise<{ song: Song }> => {
    throw new Error('createSong unsupported — use generateApi.create() instead.');
  },

  // We don't support editing title/style after creation yet. Return whatever's
  // currently stored so the UI sees a result instead of an error.
  updateSong: async (id: string, _updates: Partial<Song>, _token: string): Promise<{ song: any }> => {
    const { song } = await songsApi.getSong(id);
    return { song };
  },

  deleteSong: (id: string, _token?: string): Promise<{ success: boolean }> =>
    api(`/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // List every track that already has stems on disk. Each entry comes back
  // with stems URLs pre-signed with the Firebase token so they're directly
  // playable / downloadable.
  listStems: async (): Promise<{ tracks: Array<{ id: number; title: string; createdAt: string; audioUrl: string | null; coverUrl: string | null; stems: Record<string, string> }> }> => {
    const { tracks } = await api<{ tracks: Array<{ id: number; title: string; createdAt: string; audioUrl: string | null; coverUrl: string | null; stems: Record<string, string> }> }>('/api/stems');
    const tok = await firebaseAuth.currentUser?.getIdToken();
    const sign = (u: string | null) => {
      if (!u) return null;
      const abs = `${API_BASE}${u}`;
      return tok ? `${abs}${abs.includes('?') ? '&' : '?'}token=${encodeURIComponent(tok)}` : abs;
    };
    return {
      tracks: tracks.map((t) => ({
        ...t,
        audioUrl: sign(t.audioUrl),
        coverUrl: sign(t.coverUrl),
        stems: Object.fromEntries(Object.entries(t.stems).map(([k, v]) => [k, sign(v)!])),
      })),
    };
  },

  // Run Demucs htdemucs on the finished track. ~30–60s wall time on a 3090.
  // Returns auth'd stem URLs (vocals/bass/drums/other) that the UI can hand
  // straight to <audio> or download links.
  extractStems: async (id: string): Promise<{ ok: boolean; stems: Record<string, string> }> => {
    const r = await api<{ ok: boolean; promptId: string; stems: Record<string, string> }>(
      `/api/jobs/${encodeURIComponent(id)}/stems`,
      { method: 'POST' },
    );
    // Append the Firebase ID token so <audio src> / <a download> can fetch
    // the auth'd /api/stems URLs without needing an Authorization header.
    const tok = await firebaseAuth.currentUser?.getIdToken();
    const signed: Record<string, string> = {};
    for (const [name, rel] of Object.entries(r.stems || {})) {
      const abs = `${API_BASE}${rel}`;
      signed[name] = tok ? `${abs}?token=${encodeURIComponent(tok)}` : abs;
    }
    return { ok: r.ok, stems: signed };
  },

  // Likes / play-count not modelled server-side; treat as no-ops.
  toggleLike:    async (_id: string, _token?: string): Promise<{ liked: boolean }> => ({ liked: false }),
  trackPlay:     async (_id: string, _token?: string | null): Promise<{ viewCount: number }> => ({ viewCount: 0 }),

  // Privacy IS wired — flips tracks.is_public on the row. Toggle by passing
  // no body, or set explicitly via { isPublic }.
  togglePrivacy: async (id: string, _token?: string): Promise<{ isPublic: boolean }> => {
    const r = await api<{ id: number; isPublic: boolean }>(`/api/jobs/${encodeURIComponent(id)}/privacy`, { method: 'PATCH' });
    return { isPublic: r.isPublic };
  },

  // Comments not yet implemented — return empty / reject.
  getComments:   async (_id: string, _token?: string | null): Promise<{ comments: Comment[] }> => ({ comments: [] }),
  addComment:    async (_id: string, _c: string, _token?: string): Promise<{ comment: Comment }> => { throw new Error('Comments are not available yet.'); },
  deleteComment: async (_id: string, _token?: string): Promise<{ success: boolean }> => ({ success: true }),
};

// Transcribe API — runs the Granite ASR workflow on a staged upload, returns
// the lyric text + word-level timing data (for Phase 2 LRC export). The
// Transcribe button in the Transform panel hits this directly.
export const transcribeApi = {
  run: async (uploadId: number): Promise<{ text: string; segments: any | null; promptId: string }> =>
    api('/api/transcribe', { method: 'POST', body: { uploadId } }),
};

// LRC API — produces a karaoke .lrc for any finished track in the user's
// library. First call runs ASR (~5–15s on a 60s track once Granite is
// warm); subsequent calls stream from disk. The browser handles the
// download via a temporary blob URL since the route returns a file body
// (not JSON).
export const lrcApi = {
  download: async (trackId: number | string): Promise<{ blob: Blob; filename: string }> => {
    const tok = (await firebaseAuth.currentUser?.getIdToken()) ?? null;
    const res = await fetch(`${API_BASE}/api/lrc/${encodeURIComponent(String(trackId))}`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'LRC download failed' }));
      throw new Error(`${res.status}: ${err.error || 'LRC download failed'}`);
    }
    // Pull the filename out of content-disposition if present.
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/i);
    const filename = (m?.[1] ?? `track_${trackId}.lrc`);
    return { blob: await res.blob(), filename };
  },
};

// Upload staging API — backs the SourceAudioPicker that the Transform-panel
// features (Transcribe, Cover, Repaint, Extend, Edit) consume. Files are
// staged into ComfyUI's input/ folder so any LoadAudio-fed workflow can
// pick them up by basename.
export interface StagedUpload {
  uploadId: number;
  filename: string;
  originalName?: string | null;
  trackId?: number;
  title?: string | null;
  sizeBytes?: number;
}
export const uploadsApi = {
  // Multipart upload — bypasses api() because the helper hard-codes JSON
  // content-type. We still attach the Firebase bearer token manually.
  upload: async (file: File): Promise<StagedUpload> => {
    const tok = (await firebaseAuth.currentUser?.getIdToken()) ?? null;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/api/uploads`, {
      method: 'POST',
      headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'upload failed' }));
      throw new Error(`${res.status}: ${err.error || 'upload failed'}`);
    }
    return res.json();
  },
  // Copy a finished track from the user's library into ComfyUI's input/ as
  // a staged upload — no download/re-upload round-trip needed.
  fromTrack: async (trackId: number | string): Promise<StagedUpload> =>
    api('/api/uploads/from-track', { method: 'POST', body: { trackId: Number(trackId) } }),
  list: async (): Promise<{ uploads: StagedUpload[] }> => api('/api/uploads'),
};

interface Comment {
  id: string;
  song_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
}

// Generation API
export interface GenerationParams {
  // Mode
  customMode: boolean;
  songDescription?: string;

  // Custom Mode
  prompt?: string;
  lyrics: string;
  style: string;
  title: string;

  // Model Selection
  ditModel?: string;

  // Common
  instrumental: boolean;
  vocalLanguage?: string;
  // Optional RVC voice clone — when set, the generated vocal is run through
  // RVC after demucs split, then remixed with the instrumental. Filename of
  // the .pth (e.g. "Claire.pth"). Backend ignores it if the clone workflow
  // isn't wired.
  voiceModel?: string | null;

  // Music Parameters
  duration?: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;

  // Generation Settings
  inferenceSteps?: number;
  guidanceScale?: number;
  batchSize?: number;
  randomSeed?: boolean;
  seed?: number;
  thinking?: boolean;
  audioFormat?: 'mp3' | 'flac';
  // MP3 bitrate (only relevant when audioFormat is mp3). Forwarded to ACE-Step's
  // SaveAudioMP3 node as `quality`. V0 = best VBR; 320k = max CBR; 128k = small.
  mp3Quality?: 'V0' | '128k' | '320k';
  inferMethod?: 'ode' | 'sde';
  shift?: number;

  // LM Parameters
  lmTemperature?: number;
  lmCfgScale?: number;
  lmTopK?: number;
  lmTopP?: number;
  lmNegativePrompt?: string;
  lmBackend?: 'pt' | 'vllm';
  lmModel?: string;

  // Expert Parameters
  referenceAudioUrl?: string;
  sourceAudioUrl?: string;
  referenceAudioTitle?: string;
  sourceAudioTitle?: string;
  audioCodes?: string;
  repaintingStart?: number;
  repaintingEnd?: number;
  instruction?: string;
  audioCoverStrength?: number;
  taskType?: string;
  // Cover/Repaint/Extend/Edit source upload id (from uploadsApi).
  uploadId?: number | null;
  useAdg?: boolean;
  cfgIntervalStart?: number;
  cfgIntervalEnd?: number;
  customTimesteps?: string;
  useCotMetas?: boolean;
  useCotCaption?: boolean;
  useCotLanguage?: boolean;
  autogen?: boolean;
  constrainedDecodingDebug?: boolean;
  allowLmBatch?: boolean;
  getScores?: boolean;
  getLrc?: boolean;
  scoreScale?: number;
  lmBatchChunkSize?: number;
  trackName?: string;
  completeTrackClasses?: string[];
  isFormatCaption?: boolean;
  loraLoaded?: boolean;
  // Trained LoRA picker (Task #19) — `loraName` is the .safetensors filename
  // listed in modelsApi.list().loras; `loraStrength` is the slider value.
  // Backend splices a LoraLoaderModelOnly node into the text2music graph
  // when `loraName` is non-empty.
  loraName?: string | null;
  loraStrength?: number;
}

export interface GenerationJob {
  jobId: string;
  id?: string;
  status: 'pending' | 'queued' | 'running' | 'succeeded' | 'failed';
  queuePosition?: number;
  etaSeconds?: number;
  progress?: number;
  stage?: string;
  params?: any;
  created_at?: string;
  result?: {
    audioUrls: string[];
    bpm?: number;
    duration?: number;
    keyScale?: string;
    timeSignature?: string;
  };
  error?: string;
}

// Translate the upstream GenerationParams into the body our /api/generate expects.
// Keys map best-effort; unsupported knobs (CFG scale, ADG, repainting, LM
// settings, source/reference audio) are silently dropped — backend ignores them.
//
// Bulk count is *not* sent to the backend; the adapter below fans out N
// parallel /api/generate calls instead, which gives us per-job track rows.
function toBackendBody(p: GenerationParams) {
  // the upstream audioFormat is 'mp3'|'flac'; our backend accepts MP3 bitrate
  // strings ('V0'|'128k'|'320k') or undefined. Default to V0 (best VBR).
  const allowed: Array<'V0' | '128k' | '320k'> = ['V0', '128k', '320k'];
  const quality = (p.mp3Quality && allowed.includes(p.mp3Quality)) ? p.mp3Quality : 'V0';
  // Use the AI-Enhance / write-lyrics-for-me flow only if there's a theme but
  // no concrete lyrics yet. Otherwise treat lyrics as user-supplied.
  const hasLyrics = !!(p.lyrics && p.lyrics.trim());
  const themeFallback = !hasLyrics ? (p.songDescription || p.prompt) : undefined;
  const writeLyrics = !hasLyrics && !!themeFallback;
  // Backend only accepts 'studio' (XL SFT, default) or 'turbo'. Coerce
  // anything else — including the upstream UI's old turbo-shift variants — to
  // studio. Studio is also the explicit fallback for missing values.
  const ditModel = p.ditModel === 'turbo' ? 'turbo' : 'studio';

  // "Auto" slider/dropdown values arrive as 0 or empty string — translate
  // them to undefined so the backend uses the template default. Sending
  // bpm=0 or key="" makes ACE-Step's TextEncodeAceStepAudio1.5 node reject
  // the prompt and the whole job gets marked as errored.
  const num = (v: unknown) => (typeof v === 'number' && v > 0) ? v : undefined;
  const str = (v: unknown) => (typeof v === 'string' && v.trim()) ? v : undefined;

  return {
    title: p.title || undefined,
    style: p.style || p.songDescription || p.prompt || '',
    // Instrumental wins regardless of whatever's in the lyrics box — flipping
    // the toggle ON means "no vocals" even if the box still has leftover text.
    // ACE-Step treats '[inst]' as the signal for an instrumental-only track.
    lyrics: p.instrumental ? '[inst]' : (hasLyrics ? p.lyrics : ''),
    duration:       num(p.duration),
    bpm:            num(p.bpm),
    key:            str(p.keyScale),
    timesignature:  str(p.timeSignature),
    language:       str(p.vocalLanguage),
    quality,
    steps:          num(p.inferenceSteps),
    temperature:    typeof p.lmTemperature === 'number' ? p.lmTemperature : undefined,
    cfgScale:       typeof p.lmCfgScale === 'number' && p.lmCfgScale > 0 ? p.lmCfgScale : undefined,
    topP:           typeof p.lmTopP === 'number' && p.lmTopP > 0 && p.lmTopP <= 1 ? p.lmTopP : undefined,
    topK:           typeof p.lmTopK === 'number' && p.lmTopK >= 0 ? p.lmTopK : undefined,
    shift:          typeof p.shift === 'number' && p.shift > 0 ? p.shift : undefined,
    // Negative prompt: deliberately NOT forwarded. The graph rewrite that
    // routed a second TextEncode into KSampler.negative caused reproducible
    // distortion on Studio + cfg=5 (tracks #61/#63/#64). See
    // docs/lm-negative-prompt.md.
    // randomSeed=true or seed=-1 (CreatePanel's sentinel for "random") -> undefined.
    seed: p.randomSeed ? undefined : (typeof p.seed === 'number' && p.seed >= 0 ? p.seed : undefined),
    writeLyrics,
    theme: writeLyrics ? themeFallback : undefined,
    ditModel,
    voiceModel: p.voiceModel || undefined,
    // Phase 4+ task routing. Backend defaults to "text2music" when omitted.
    taskType: p.taskType && p.taskType !== 'text2music' ? p.taskType : undefined,
    uploadId: p.uploadId ?? undefined,
    audioCoverStrength: typeof p.audioCoverStrength === 'number' ? p.audioCoverStrength : undefined,
    repaintingStart: typeof p.repaintingStart === 'number' ? p.repaintingStart : undefined,
    repaintingEnd:   typeof p.repaintingEnd   === 'number' ? p.repaintingEnd   : undefined,
    cfgIntervalStart: typeof p.cfgIntervalStart === 'number' ? p.cfgIntervalStart : undefined,
    cfgIntervalEnd:   typeof p.cfgIntervalEnd   === 'number' ? p.cfgIntervalEnd   : undefined,
    trackName: p.trackName?.trim() || undefined,
    completeTrackClasses: Array.isArray(p.completeTrackClasses) && p.completeTrackClasses.length
      ? p.completeTrackClasses : undefined,
    // Trained LoRA forwarded only when the user actually selected one — the
    // backend graph is bit-identical to pre-Phase-19 when this is undefined.
    loraName: p.loraName?.trim() || undefined,
    loraStrength: typeof p.loraStrength === 'number' ? p.loraStrength : undefined,
  };
}

interface BackendGenerateResponse {
  trackId: number;
  promptId: string;
  coverPromptId?: string;
  seed: number;
  duration: number;
}

// Convert our /api/jobs status into the shape the upstream polling code expects.
function toGenerationJob(t: BackendTrack): GenerationJob {
  const statusMap: Record<BackendTrack['status'], GenerationJob['status']> = {
    queued: 'queued', running: 'running', done: 'succeeded', error: 'failed',
  };
  return {
    jobId: String(t.id),
    id: String(t.id),
    status: statusMap[t.status],
    queuePosition: t.queuePosition ?? undefined,
    progress: t.progress?.percent,
    params: t.params,
    created_at: t.createdAt,
    result: t.audioUrl ? {
      audioUrls: [withSignedToken(`${API_BASE}${t.audioUrl}`)!],
      duration: typeof t.params.duration === 'number' ? t.params.duration : undefined,
      bpm:      typeof t.params.bpm === 'number' ? t.params.bpm : undefined,
      keyScale: typeof t.params.key === 'string' ? t.params.key : undefined,
      timeSignature: typeof t.params.timesignature === 'string' ? t.params.timesignature : undefined,
    } : undefined,
  };
}

export const generateApi = {
  // Kick off generation. If bulkCount > 1, fan out parallel calls — backend
  // returns one trackId per job, which the UI then polls via getStatus().
  startGeneration: async (params: GenerationParams, _token?: string): Promise<GenerationJob> => {
    const body = toBackendBody(params);
    const bulk = Math.max(1, Math.min(10, Number(params.batchSize) || 1));
    const submissions = await Promise.all(
      Array.from({ length: bulk }, () => api<BackendGenerateResponse>('/api/generate', { method: 'POST', body })),
    );
    // The UI only tracks one job-id at a time; return the first. The rest
    // appear in /api/jobs and the Library polls them independently.
    const first = submissions[0];
    return {
      jobId: String(first.trackId),
      id: String(first.trackId),
      status: 'queued',
      params: body,
      created_at: new Date().toISOString(),
    };
  },

  getStatus: async (jobId: string, _token?: string): Promise<GenerationJob> => {
    const t = await api<BackendTrack>(`/api/jobs/${encodeURIComponent(jobId)}`);
    return toGenerationJob(t);
  },

  getHistory: async (_token?: string): Promise<{ jobs: GenerationJob[] }> => {
    const { tracks } = await api<{ tracks: BackendTrack[] }>('/api/jobs');
    return { jobs: tracks.map(toGenerationJob) };
  },

  // Reference-audio upload not supported on our backend yet.
  uploadAudio: async (_file: File, _token?: string): Promise<{ url: string; key: string }> => {
    throw new Error('Reference audio upload is not available yet.');
  },

  // "Format" / AI-enhance maps to our /api/lyrics (Ollama-backed lyric writer).
  // Only the lyrics field is reliably re-derived; everything else echoes back.
  formatInput: async (params: { caption: string; lyrics?: string; bpm?: number; duration?: number; keyScale?: string; timeSignature?: string }) => {
    try {
      const { lyrics } = await api<{ lyrics: string }>('/api/lyrics', { method: 'POST', body: { theme: params.caption, language: 'en' } });
      return {
        caption: params.caption,
        lyrics,
        bpm: params.bpm,
        duration: params.duration,
        key_scale: params.keyScale,
        time_signature: params.timeSignature,
        status_message: 'Lyrics generated.',
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Format failed' };
    }
  },

  // We don't ship random sample prompts — return an empty, neutral default.
  getRandomDescription: async (): Promise<{ description: string; instrumental: boolean; vocalLanguage: string }> => ({
    description: '', instrumental: false, vocalLanguage: 'en',
  }),

  // LoRA / training APIs aren't supported in our stack — stubs prevent crashes.
  loadLora:     async (_p: { lora_path: string }) => ({ message: 'LoRA not supported here.', lora_path: '' }),
  unloadLora:   async () => ({ message: 'LoRA not supported here.' }),
  setLoraScale: async (_p: { scale: number }) => ({ message: 'LoRA not supported here.', scale: 0 }),
  toggleLora:   async (_p: { enabled: boolean }) => ({ message: 'LoRA not supported here.', active: false }),
  getLoraStatus: async () => ({ loaded: false, active: false, scale: 0, path: '' }),
};

// Users API
export interface UserProfile extends User {
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  created_at: string;
}

// Users / social graph (profiles, followers, public songs) — our backend
// doesn't expose any of these yet. Stub everything to neutral defaults so the
// UI degrades gracefully instead of crashing.
const emptyUserProfile: UserProfile = {
  id: '', username: 'unknown', isAdmin: false, bio: '', avatar_url: '', banner_url: '', created_at: '',
};
export const usersApi = {
  getProfile: async (username: string, _t?: string | null): Promise<{ user: UserProfile }> => {
    try {
      const { user } = await api<{ user: UserProfile }>(`/api/users/${encodeURIComponent(username)}`);
      return { user };
    } catch {
      return { user: { ...emptyUserProfile, username } };
    }
  },
  getPublicSongs: async (username: string): Promise<{ songs: Song[] }> => {
    try {
      const { tracks } = await api<{ tracks: (BackendTrack & { creator?: string })[] }>(`/api/users/${encodeURIComponent(username)}/songs`);
      return { songs: tracks.map((t) => ({ ...toFspeciiSong(t, ctx()), creator: t.creator ?? username })) };
    } catch {
      return { songs: [] };
    }
  },
  getPublicPlaylists:  async (_u: string): Promise<{ playlists: any[] }> => ({ playlists: [] }),
  getFeaturedCreators: async (): Promise<{ creators: Array<UserProfile & { follower_count?: number }> }> => {
    try { return await api<{ creators: Array<UserProfile & { follower_count?: number }> }>('/api/users/public/featured'); }
    catch { return { creators: [] }; }
  },
  updateProfile:       async (_updates: Partial<User>, _t?: string): Promise<{ user: User }> => { throw new Error('Profile editing is not available yet.'); },
  uploadAvatar:        async (_f: File, _t?: string): Promise<{ user: UserProfile; url: string }> => { throw new Error('Avatar uploads are not available yet.'); },
  uploadBanner:        async (_f: File, _t?: string): Promise<{ user: UserProfile; url: string }> => { throw new Error('Banner uploads are not available yet.'); },
  toggleFollow:        async (_u: string, _t?: string): Promise<{ following: boolean; followerCount: number }> => ({ following: false, followerCount: 0 }),
  getFollowers:        async (_u: string): Promise<{ followers: User[] }> => ({ followers: [] }),
  getFollowing:        async (_u: string): Promise<{ following: User[] }> => ({ following: [] }),
  getStats:            async (_u: string, _t?: string | null): Promise<{ followerCount: number; followingCount: number; isFollowing: boolean }> => ({ followerCount: 0, followingCount: 0, isFollowing: false }),
};

// Playlists API
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  cover_url?: string;
  is_public?: boolean;
  user_id?: string;
  created_at?: string;
  song_count?: number;
}

// Our backend's playlist row shapes.
interface BackendPlaylist {
  id: number;
  name: string;
  trackCount?: number;
  createdAt?: string;
}
function toFspeciiPlaylist(p: BackendPlaylist): Playlist {
  return {
    id: String(p.id),
    name: p.name,
    description: undefined,
    cover_url: undefined,
    is_public: false,
    user_id: ctx()?.id,
    created_at: p.createdAt,
    song_count: p.trackCount ?? 0,
  };
}

export const playlistsApi = {
  create: async (name: string, _description: string, _isPublic: boolean, _token?: string): Promise<{ playlist: Playlist }> => {
    const { playlist } = await api<{ playlist: BackendPlaylist }>('/api/playlists', { method: 'POST', body: { name } });
    return { playlist: toFspeciiPlaylist(playlist) };
  },

  getMyPlaylists: async (_token?: string): Promise<{ playlists: Playlist[] }> => {
    const { playlists } = await api<{ playlists: BackendPlaylist[] }>('/api/playlists');
    return { playlists: playlists.map(toFspeciiPlaylist) };
  },

  getPlaylist: async (id: string, _token?: string | null): Promise<{ playlist: Playlist; songs: Song[] }> => {
    const data = await api<{ playlist: BackendPlaylist; tracks: BackendTrack[] }>(`/api/playlists/${encodeURIComponent(id)}`);
    return {
      playlist: toFspeciiPlaylist(data.playlist),
      songs: data.tracks.map((t) => toFspeciiSong(t, ctx())),
    };
  },

  // We don't expose public playlists yet.
  getFeaturedPlaylists: async (): Promise<{ playlists: Array<Playlist & { creator?: string; creator_avatar?: string }> }> => ({ playlists: [] }),

  // Backend route is /tracks (not /songs) and takes { trackId } (not { songId }).
  addSong: async (playlistId: string, songId: string, _token?: string): Promise<{ success: boolean }> => {
    await api(`/api/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'POST',
      body: { trackId: Number(songId) },
    });
    return { success: true };
  },

  removeSong: async (playlistId: string, songId: string, _token?: string): Promise<{ success: boolean }> => {
    await api(`/api/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(songId)}`, { method: 'DELETE' });
    return { success: true };
  },

  // Updating playlist name/description/privacy not yet supported server-side —
  // return the current row so the UI sees a result.
  update: async (id: string, updates: Partial<Playlist>, _token?: string): Promise<{ playlist: Playlist }> => {
    const { playlist } = await playlistsApi.getPlaylist(id);
    return { playlist: { ...playlist, ...updates } };
  },

  delete: async (id: string, _token?: string): Promise<{ success: boolean }> => {
    await api(`/api/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return { success: true };
  },
};

// Search API
export interface SearchResult {
  songs: Song[];
  creators: Array<UserProfile & { follower_count?: number }>;
  playlists: Array<Playlist & { creator?: string; creator_avatar?: string }>;
}

export const searchApi = {
  // Cross-user public search (songs + creators). Backend filters on
  // tracks.is_public + status='done'. Empty query short-circuits.
  search: async (query: string, type: 'songs' | 'creators' | 'playlists' | 'all' = 'all'): Promise<SearchResult> => {
    const q = (query || '').trim();
    if (!q) return { songs: [], creators: [], playlists: [] };
    try {
      const r = await api<{
        songs: (BackendTrack & { creator?: string })[];
        creators: Array<UserProfile & { follower_count?: number }>;
        playlists: Array<Playlist & { creator?: string; creator_avatar?: string }>;
      }>(`/api/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`);
      return {
        songs: (r.songs || []).map((t) => ({ ...toFspeciiSong(t, ctx()), creator: t.creator ?? '' })),
        creators: r.creators || [],
        playlists: r.playlists || [],
      };
    } catch {
      // Fall back to local-library filter if the public endpoint is down.
      const lower = q.toLowerCase();
      const { songs } = await songsApi.getMySongs();
      return {
        songs: songs.filter((s) =>
          s.title.toLowerCase().includes(lower)
          || (s.style || '').toLowerCase().includes(lower)
          || (s.lyrics || '').toLowerCase().includes(lower),
        ),
        creators: [],
        playlists: [],
      };
    }
  },
};

// Contact Form API
export interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: 'general' | 'support' | 'business' | 'press' | 'legal';
}

export const contactApi = {
  // Contact form not wired to the backend. For now we no-op with a fake
  // success — keeps the UI happy. Wire to an email-send endpoint later.
  submit: async (_data: ContactFormData): Promise<{ success: boolean; message: string; id: string }> => ({
    success: true,
    message: 'Thanks — we received your message.',
    id: '',
  }),
};

// Training API (LoRA fine-tuning via Gradio)
export interface TrainingSample {
  audio: unknown;
  filename: string;
  caption: string;
  genre: string;
  promptOverride: string;
  lyrics: string;
  bpm: number;
  key: string;
  timeSignature: string;
  duration: number;
  language: string;
  instrumental: boolean;
  rawLyrics?: string;
}

export interface DatasetSettings {
  datasetName: string;
  customTag: string;
  tagPosition: 'prepend' | 'append' | 'replace';
  allInstrumental: boolean;
  genreRatio: number;
}

export interface TrainingParams {
  tensorDir?: string;
  rank?: number;
  alpha?: number;
  dropout?: number;
  learningRate?: number;
  epochs?: number;
  batchSize?: number;
  gradientAccumulation?: number;
  saveEvery?: number;
  shift?: number;
  seed?: number;
  outputDir?: string;
  resumeCheckpoint?: string | null;
}

// Helper: build proxy URL for training audio files
export function getTrainingAudioUrl(audioPath: unknown, token?: string): string | undefined {
  if (!audioPath) return undefined;

  // Handle Gradio FileData objects
  if (typeof audioPath === 'object' && audioPath !== null) {
    const fd = audioPath as Record<string, unknown>;
    if (fd.url && typeof fd.url === 'string') return fd.url;
    if (fd.path && typeof fd.path === 'string') {
      return `${API_BASE}/api/training/audio?path=${encodeURIComponent(fd.path)}`;
    }
    return undefined;
  }

  // Handle absolute path string
  if (typeof audioPath === 'string') {
    if (audioPath.startsWith('http://') || audioPath.startsWith('https://') || audioPath.startsWith('/audio/')) {
      return audioPath;
    }
    return `${API_BASE}/api/training/audio?path=${encodeURIComponent(audioPath)}`;
  }

  return undefined;
}

// Track of the most recent dataset + train/preprocess job ids the panel
// kicked off, so the UI handlers that don't pass them through (stop /
// auto-label / save) can still target the right backend resource.
let _activeDatasetId: number | null = null;
let _activeTrainJobId: number | null = null;
let _activePreprocessJobId: number | null = null;

async function uploadMultipart<T>(endpoint: string, formData: FormData): Promise<T> {
  const tok = (await firebaseAuth.currentUser?.getIdToken()) ?? null;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `${endpoint} failed` }));
    throw new Error(`${res.status}: ${err.error || endpoint}`);
  }
  return res.json();
}

export const trainingApi = {
  // ---------------- Model Configuration section ----------------
  getCheckpoints: async (_t?: string) => api('/api/training/checkpoints'),
  getLoraCheckpoints: async (_t?: string) => api('/api/training/lora-checkpoints'),
  initModel: async (body: any, _t?: string) =>
    api('/api/training/init', { method: 'POST', body }),

  // ---------------- Dataset Builder tab -----------------------
  uploadAudio: async (files: File[], datasetName: string, _t?: string) => {
    const fd = new FormData();
    fd.append('datasetName', datasetName);
    for (const f of files) fd.append('files', f);
    return uploadMultipart('/api/training/upload', fd);
  },
  buildDataset: async (body: any, _t?: string) => {
    const r: any = await api('/api/training/datasets/build', { method: 'POST', body });
    if (r?.datasetId) _activeDatasetId = r.datasetId;
    return r;
  },
  scanDirectory: async (body: any, _t?: string) => {
    const r: any = await api('/api/training/scan', { method: 'POST', body });
    if (r?.datasetId) _activeDatasetId = r.datasetId;
    return r;
  },
  loadDataset: async (datasetPath: string, _t?: string) => {
    const r: any = await api('/api/training/datasets/load', {
      method: 'POST', body: { datasetPath },
    });
    if (r?.datasetId) _activeDatasetId = r.datasetId;
    return r;
  },
  getSamplePreview: async (idx: number, _t?: string) => {
    const dsId = _activeDatasetId;
    if (!dsId) throw new Error('No dataset loaded');
    const r: any = await api(`/api/training/datasets/${dsId}/samples/${idx}`);
    return r.sample;
  },
  saveSample: async (body: any, _t?: string) => {
    const dsId = body.datasetId ?? _activeDatasetId;
    if (!dsId) throw new Error('No dataset loaded');
    const { idx, ...rest } = body;
    return api(`/api/training/datasets/${dsId}/samples/${idx}`, { method: 'PATCH', body: rest });
  },
  updateSettings: async (settings: any, _t?: string) => {
    const dsId = settings.datasetId ?? _activeDatasetId;
    if (!dsId) throw new Error('No dataset loaded');
    return api(`/api/training/datasets/${dsId}/settings`, { method: 'PUT', body: settings });
  },
  saveDataset: async (body: any, _t?: string) =>
    api('/api/training/datasets/save', {
      method: 'POST',
      body: { datasetId: _activeDatasetId, ...body },
    }),

  // ---------------- Auto-label -------------------------------
  // Runs Granite ASR (when transcribeLyrics is on) + Ollama tag generation
  // over the active dataset. Sync HTTP call — the UI's spinner stays up
  // for the duration. ~10s per sample with ASR; <2s per sample without.
  autoLabel: async (body: any, _t?: string) =>
    api('/api/training/auto-label', {
      method: 'POST',
      body: { datasetId: _activeDatasetId, ...body },
    }),

  // ---------------- Train LoRA tab ----------------------------
  preprocess: async (body: any, _t?: string) => {
    const r: any = await api('/api/training/jobs/preprocess', {
      method: 'POST', body: { datasetId: _activeDatasetId, ...body },
    });
    if (r?.jobId) _activePreprocessJobId = r.jobId;
    return r;
  },
  loadTensors: async (tensorDir: string, _t?: string) =>
    api('/api/training/tensors/load', { method: 'POST', body: { tensorDir } }),
  startTraining: async (body: any, _t?: string) => {
    const r: any = await api('/api/training/jobs/train', {
      method: 'POST', body: { datasetId: _activeDatasetId, ...body },
    });
    if (r?.jobId) _activeTrainJobId = r.jobId;
    return r;
  },
  stopTraining: async (_t?: string) => {
    const id = _activeTrainJobId;
    if (!id) return { status: 'idle' };
    return api(`/api/training/jobs/${id}/cancel`, { method: 'POST' });
  },
  // Frontend polls this every few seconds while training is in flight.
  getActiveJob: async () => {
    const id = _activeTrainJobId || _activePreprocessJobId;
    if (!id) return null;
    return api(`/api/training/jobs/${id}`);
  },

  // ---------------- Export tab --------------------------------
  exportLora: async (body: any, _t?: string) => {
    const id = body.jobId ?? _activeTrainJobId;
    if (!id) throw new Error('No training job to export — finish a training run first.');
    return api(`/api/training/jobs/${id}/export`, {
      method: 'POST', body: { outputDir: body.outputDir },
    });
  },
  listJobs: async (status?: string, kind?: string) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (kind)   q.set('kind', kind);
    return api(`/api/training/jobs${q.toString() ? `?${q}` : ''}`);
  },

  // ---------------- Import ------------------------------------
  // Multipart upload of a `dataset.json` (the file Save Dataset writes).
  // The audio referenced inside is NOT copied — caller must upload it via
  // the Dataset Builder tab afterwards. Response includes audioMissing
  // count so the UI can surface a "upload N more audio files" hint.
  importDataset: async (file: File, datasetName: string, _t?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('datasetName', datasetName);
    const r: any = await uploadMultipart('/api/training/datasets/import', fd);
    if (r?.datasetId) _activeDatasetId = r.datasetId;
    return r;
  },
};

// Surface the active-job ids so the UI can poll without re-tracking them.
export function getActiveTrainingIds() {
  return {
    datasetId: _activeDatasetId,
    trainJobId: _activeTrainJobId,
    preprocessJobId: _activePreprocessJobId,
  };
}

// Re-prime the module-level tracker after a page reload. TrainingPanel
// resume-polling calls this once it discovers a running train job via
// listJobs(); without it, the poll loop would keep returning null.
export function setActiveTrainingIds(ids: { datasetId?: number | null; trainJobId?: number | null; preprocessJobId?: number | null }) {
  if (ids.datasetId !== undefined)        _activeDatasetId        = ids.datasetId;
  if (ids.trainJobId !== undefined)       _activeTrainJobId       = ids.trainJobId;
  if (ids.preprocessJobId !== undefined)  _activePreprocessJobId  = ids.preprocessJobId;
}
