import { auth as firebaseAuth } from './firebase';

// API base — talks to our Next.js backend at api.zimbabeats.com in prod.
// Override via VITE_API_BASE for local development (e.g. http://127.0.0.1:3000).
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || 'https://api.zimbabeats.com';

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
    body: body ? JSON.stringify(body) : undefined,
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

// Adapt our backend's user row to fspecii's expected User shape. Our backend
// returns { id, email, role, disabled, track_quota, firebase_uid }; fspecii's
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

  // Compatibility stubs — fspecii's UI calls these but on our app the entire
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

// Map our /api/jobs track row to fspecii's Song shape. fspecii's UI reads
// BOTH camelCase and snake_case keys for some fields (audio_url AND audioUrl,
// like_count AND likeCount, etc.) — we populate both for safety.
function toFspeciiSong(t: BackendTrack, currentUser?: User | null): Song {
  const id = String(t.id);
  const audioRel = t.audioUrl;
  const coverRel = t.coverUrl;
  return {
    id,
    title: t.title || `Track #${t.id}`,
    lyrics: String(t.params.lyrics || ''),
    style: String(t.params.style || ''),
    caption: undefined,
    cover_url: coverRel ? `${API_BASE}${coverRel}` : undefined,
    audio_url: audioRel ? `${API_BASE}${audioRel}` : undefined,
    audioUrl:  audioRel ? `${API_BASE}${audioRel}` : undefined,
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
export function _setCurrentUserForSongMapper(u: User | null) { _currentUserCache = u; }
function ctx() { return _currentUserCache; }

export const songsApi = {
  // Library list — backed by /api/jobs.
  getMySongs: async (_token?: string): Promise<{ songs: Song[] }> => {
    const { tracks } = await api<{ tracks: BackendTrack[] }>('/api/jobs');
    return { songs: tracks.map((t) => toFspeciiSong(t, ctx())) };
  },

  // Public/featured feeds aren't supported on our backend yet — return [] so
  // the UI shows empty states instead of crashing on 404s.
  getPublicSongs:   async (_l?: number, _o?: number): Promise<{ songs: Song[] }> => ({ songs: [] }),
  getFeaturedSongs: async (): Promise<{ songs: Song[] }> => ({ songs: [] }),
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

  // Likes / privacy / play-count not modelled server-side; treat as no-ops.
  toggleLike:    async (_id: string, _token?: string): Promise<{ liked: boolean }>   => ({ liked: false }),
  togglePrivacy: async (_id: string, _token?: string): Promise<{ isPublic: boolean }> => ({ isPublic: false }),
  trackPlay:     async (_id: string, _token?: string | null): Promise<{ viewCount: number }> => ({ viewCount: 0 }),

  // Comments not yet implemented — return empty / reject.
  getComments:   async (_id: string, _token?: string | null): Promise<{ comments: Comment[] }> => ({ comments: [] }),
  addComment:    async (_id: string, _c: string, _token?: string): Promise<{ comment: Comment }> => { throw new Error('Comments are not available yet.'); },
  deleteComment: async (_id: string, _token?: string): Promise<{ success: boolean }> => ({ success: true }),
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

// Translate fspecii's GenerationParams into the body our /api/generate expects.
// Keys map best-effort; unsupported knobs (CFG scale, ADG, repainting, LM
// settings, source/reference audio) are silently dropped — backend ignores them.
//
// Bulk count is *not* sent to the backend; the adapter below fans out N
// parallel /api/generate calls instead, which gives us per-job track rows.
function toBackendBody(p: GenerationParams) {
  // fspecii's audioFormat is 'mp3'|'flac'; our backend accepts MP3 bitrate
  // strings ('V0'|'128k'|'320k') or undefined. Default to V0 (best VBR).
  const quality = 'V0';
  // Use the AI-Enhance / write-lyrics-for-me flow only if there's a theme but
  // no concrete lyrics yet. Otherwise treat lyrics as user-supplied.
  const hasLyrics = !!(p.lyrics && p.lyrics.trim());
  const themeFallback = !hasLyrics ? (p.songDescription || p.prompt) : undefined;
  const writeLyrics = !hasLyrics && !!themeFallback;

  return {
    title: p.title || undefined,
    style: p.style || p.songDescription || p.prompt || '',
    lyrics: hasLyrics ? p.lyrics : (p.instrumental ? '[inst]' : ''),
    duration: p.duration,
    bpm: p.bpm,
    key: p.keyScale,
    timesignature: p.timeSignature,
    language: p.vocalLanguage,
    quality,
    steps: p.inferenceSteps,
    temperature: p.lmTemperature,
    seed: p.randomSeed ? undefined : p.seed,
    writeLyrics,
    theme: writeLyrics ? themeFallback : undefined,
  };
}

interface BackendGenerateResponse {
  trackId: number;
  promptId: string;
  coverPromptId?: string;
  seed: number;
  duration: number;
}

// Convert our /api/jobs status into the shape fspecii's polling code expects.
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
      audioUrls: [`${API_BASE}${t.audioUrl}`],
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
    // Best-effort: if the requested username matches our current user, hand
    // back our local profile so "View Profile" doesn't 404.
    const me = ctx();
    if (me && me.username === username) return { user: { ...emptyUserProfile, ...me } };
    return { user: { ...emptyUserProfile, username } };
  },
  getPublicSongs:      async (_u: string): Promise<{ songs: Song[] }> => ({ songs: [] }),
  getPublicPlaylists:  async (_u: string): Promise<{ playlists: any[] }> => ({ playlists: [] }),
  getFeaturedCreators: async (): Promise<{ creators: Array<UserProfile & { follower_count?: number }> }> => ({ creators: [] }),
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
  // Backend doesn't have a search endpoint yet, so filter the user's own
  // library client-side on title/style/lyrics. Public discovery is empty for
  // now — surfaces as "no results" rather than a fetch error.
  search: async (query: string, _type?: 'songs' | 'creators' | 'playlists' | 'all'): Promise<SearchResult> => {
    const q = (query || '').toLowerCase().trim();
    if (!q) return { songs: [], creators: [], playlists: [] };
    const { songs } = await songsApi.getMySongs();
    const matched = songs.filter((s) =>
      s.title.toLowerCase().includes(q)
      || (s.style || '').toLowerCase().includes(q)
      || (s.lyrics || '').toLowerCase().includes(q),
    );
    return { songs: matched, creators: [], playlists: [] };
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

// LoRA fine-tuning isn't supported on this deployment — every method below
// rejects with the same error so the Training tab degrades to "unavailable"
// rather than throwing arbitrary fetch failures.
const TRAINING_UNAVAILABLE = () => Promise.reject(new Error('Training is not available on this deployment.'));

export const trainingApi = {
  uploadAudio: (_files: File[], _ds: string, _t: string) => TRAINING_UNAVAILABLE() as Promise<any>,

  buildDataset:       (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  scanDirectory:      (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  autoLabel:          (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  initModel:          (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  getCheckpoints:     (..._a: unknown[]) => Promise.resolve({ checkpoints: [], configs: [] }),
  getLoraCheckpoints: (..._a: unknown[]) => Promise.resolve({ checkpoints: [], outputDir: '' }),
  preprocess:         (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  loadDataset:        (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  getSamplePreview:   (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  saveSample:         (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  updateSettings:     (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  saveDataset:        (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  loadTensors:        (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  startTraining:      (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  stopTraining:       (..._a: unknown[]) => Promise.resolve({ status: 'idle' }),
  exportLora:         (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
  importDataset:      (..._a: unknown[]) => TRAINING_UNAVAILABLE() as Promise<any>,
};
