// MusicVideoPanel — the dedicated "AI Music Video" screen.
// User picks a finished song, uploads a reference image, types a style
// prompt, and gets back a Wan 2.2 S2V rendered video (~60-120s on a 3090
// for a 5s clip). Past videos are listed below; clicking one plays it
// inline.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Music, ImagePlus, Upload, Loader2, Play, Trash2, Video as VideoIcon, AlertCircle } from 'lucide-react';
import { Song } from '../types';
import { musicVideoApi, MusicVideo, API_BASE } from '../services/api';
import { auth as firebaseAuth } from '../services/firebase';

interface Props {
  songs: Song[];
  token: string | null;
}

export default function MusicVideoPanel({ songs, token }: Props) {
  const finishedSongs = songs.filter((s) => !s.isGenerating && s.audioUrl);
  const [pickedSongId, setPickedSongId] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [stylePrompt, setStylePrompt] = useState(
    'cinematic music video, soft golden hour lighting, shallow depth of field, emotive performance',
  );
  const [length, setLength] = useState(5); // seconds
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [videos, setVideos] = useState<MusicVideo[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickedSong = pickedSongId ? finishedSongs.find((s) => s.id === pickedSongId) : null;

  // Build the auth-signed video URL once per video id so <video src=…> can
  // load without setting headers.
  const refreshSignedUrls = useCallback(async (list: MusicVideo[]) => {
    const tok = (await firebaseAuth.currentUser?.getIdToken()) ?? null;
    if (!tok) return;
    const next: Record<number, string> = {};
    for (const v of list) {
      if (v.videoUrl) {
        const abs = `${API_BASE}${v.videoUrl}`;
        next[v.id] = `${abs}${abs.includes('?') ? '&' : '?'}token=${encodeURIComponent(tok)}`;
      }
    }
    setSignedUrls(next);
  }, []);

  const loadList = useCallback(async () => {
    if (!token) return;
    try {
      const { videos } = await musicVideoApi.list();
      setVideos(videos);
      refreshSignedUrls(videos);
    } catch (e) {
      console.error('failed to load music videos', e);
    }
  }, [token, refreshSignedUrls]);

  useEffect(() => { loadList(); }, [loadList]);

  // Poll any in-flight video every 4s — the generation runs ~60-120s on a
  // 3090 so we don't want to hammer the route. The effect tears itself
  // down when no jobs are running.
  useEffect(() => {
    const inflight = videos.filter((v) => v.status === 'running' || v.status === 'queued');
    if (!inflight.length || !token) return;
    let cancelled = false;
    const tick = async () => {
      const updated = await Promise.all(
        inflight.map((v) => musicVideoApi.get(v.id).then((r) => r.video).catch(() => v)),
      );
      if (cancelled) return;
      setVideos((prev) => prev.map((v) => updated.find((u) => u.id === v.id) || v));
      const done = updated.filter((v) => v.status === 'done' && !signedUrls[v.id]);
      if (done.length) refreshSignedUrls(updated);
    };
    const id = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [videos, token, signedUrls, refreshSignedUrls]);

  function onPickImage(f: File | null) {
    setError(null);
    setImage(f);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function handleGenerate() {
    if (!pickedSong || !image) return;
    setIsCreating(true); setError(null);
    try {
      const { uploadId } = await musicVideoApi.uploadImage(image);
      await musicVideoApi.create({
        trackId: Number(pickedSong.id),
        imageUploadId: uploadId,
        stylePrompt: stylePrompt.trim(),
        length,
      });
      await loadList();
      onPickImage(null);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this music video?')) return;
    try {
      await musicVideoApi.remove(id);
      setVideos((prev) => prev.filter((v) => v.id !== id));
    } catch (e) { console.error(e); }
  }

  return (
    <div className="flex flex-col h-full w-full bg-zinc-50 dark:bg-suno overflow-y-auto">
      <div className="max-w-3xl w-full mx-auto p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">AI Music Video</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Pick one of your tracks, upload a reference image of the singer, write a scene prompt — Wan 2.2 S2V renders a video that moves to the music. 5 s clip ≈ 60-120 s on the 3090.
          </p>
        </header>

        {/* Step 1 — Song */}
        <section className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-3">
          <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
            <Music size={14} /> 1. Pick a song
          </h2>
          {finishedSongs.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No finished tracks yet — generate one in the Create panel first.
            </p>
          ) : (
            <select
              value={pickedSongId ?? ''}
              onChange={(e) => setPickedSongId(e.target.value || null)}
              className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none"
            >
              <option value="">— select a track —</option>
              {finishedSongs.map((s) => (
                <option key={s.id} value={s.id}>{s.title || `Track #${s.id}`}</option>
              ))}
            </select>
          )}
        </section>

        {/* Step 2 — Image */}
        <section className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-3">
          <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
            <ImagePlus size={14} /> 2. Reference image
          </h2>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onPickImage(f); }}
            className={`flex items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-colors py-6 ${imagePreviewUrl ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/10' : 'border-zinc-300 dark:border-white/15 hover:border-zinc-400 dark:hover:border-white/25'}`}
          >
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt="reference" className="max-h-48 rounded-md object-contain" />
            ) : (
              <div className="text-center text-zinc-500">
                <Upload size={24} className="mx-auto mb-1" />
                <div className="text-sm">Drop or click to upload</div>
                <div className="text-[11px] text-zinc-400">PNG, JPG, WebP · up to 8 MB</div>
              </div>
            )}
            <input
              ref={fileInputRef} type="file" hidden
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => { const f = e.target.files?.[0]; onPickImage(f || null); e.target.value = ''; }}
            />
          </div>
        </section>

        {/* Step 3 — Prompt */}
        <section className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-3">
          <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-200">3. Scene prompt</h2>
          <textarea
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            placeholder="e.g. cinematic music video, neon city, slow pan, rain on windows"
            className="w-full h-20 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg p-3 text-sm text-zinc-900 dark:text-white focus:outline-none resize-none"
          />
          <div className="flex items-center justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            <label htmlFor="mv-length">Length (s)</label>
            <input
              id="mv-length" type="range" min={3} max={15} step={1}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="flex-1 accent-pink-500"
            />
            <span className="tabular-nums">{length}s</span>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle size={14} className="mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={!pickedSong || !image || isCreating}
          className="w-full py-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {isCreating ? <Loader2 size={16} className="animate-spin" /> : <VideoIcon size={16} />}
          {isCreating ? 'Submitting…' : 'Generate music video'}
        </button>

        {/* Library */}
        <section className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-3">
          <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-200">Your music videos</h2>
          {videos.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Nothing yet. Submit one above.</p>
          ) : (
            <ul className="space-y-2">
              {videos.map((v) => (
                <li key={v.id} className="rounded-lg border border-zinc-200 dark:border-white/5 p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
                        {v.trackTitle || `Track #${v.trackId ?? '?'}`}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {v.stylePrompt || '—'}
                      </div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      v.status === 'done'    ? 'bg-green-500/20 text-green-600 dark:text-green-300' :
                      v.status === 'error'   ? 'bg-red-500/20 text-red-600 dark:text-red-300' :
                                               'bg-pink-500/20 text-pink-600 dark:text-pink-300 animate-pulse'
                    }`}>
                      {v.status === 'running' && v.progress?.percent != null
                        ? `${v.progress.percent}%`
                        : v.status}
                    </span>
                    <button onClick={() => handleDelete(v.id)} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-white/5 rounded">
                      <Trash2 size={14} className="text-zinc-500" />
                    </button>
                  </div>
                  {v.status === 'done' && signedUrls[v.id] && (
                    <video src={signedUrls[v.id]} controls className="w-full rounded-md max-h-72 bg-black" />
                  )}
                  {v.status === 'error' && v.errorMessage && (
                    <p className="text-[11px] text-red-500">{v.errorMessage}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
