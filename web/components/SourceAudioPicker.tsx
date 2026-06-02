// SourceAudioPicker — modal that lets the user choose source audio for the
// Transform-panel features (Transcribe, Cover, Repaint, Extend, Edit).
// Two tabs: pick a finished track from their library, or drop in a new file.
// Either path resolves to a StagedUpload that any downstream feature can hand
// to the backend by uploadId.
import { useEffect, useRef, useState } from 'react';
import { Upload, X, Music2, Loader2 } from 'lucide-react';
import { uploadsApi, songsApi, StagedUpload, Song } from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (staged: StagedUpload) => void;
  // Optional title shown at the top of the modal — lets the parent feature
  // brand the picker ("Choose track to transcribe", "Choose source for cover").
  title?: string;
}

export default function SourceAudioPicker({ open, onClose, onPick, title = 'Choose audio' }: Props) {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null); // track id while staging from library
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Lazy-load the user's library only when the modal opens, and only when
  // they're on the library tab — keeps the picker snappy.
  useEffect(() => {
    if (!open || tab !== 'library') return;
    let cancelled = false;
    setLoading(true);
    songsApi.getMySongs().then(({ songs }) => {
      if (cancelled) return;
      // Only finished tracks can be staged — exclude queued/running rows.
      setSongs(songs.filter((s) => !!s.audio_url || !!s.audioUrl));
      setLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      setError(String(e?.message || e));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, tab]);

  if (!open) return null;

  async function stageFromTrack(song: Song) {
    setBusyId(song.id); setError(null);
    try {
      const staged = await uploadsApi.fromTrack(song.id);
      onPick({ ...staged, title: song.title });
      onClose();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  async function stageFromFile(file: File) {
    setUploading(true); setError(null);
    try {
      const staged = await uploadsApi.upload(file);
      onPick(staged);
      onClose();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col bg-white dark:bg-suno-card rounded-xl shadow-2xl border border-zinc-200 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-white/10">
          <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-white/5">
            <X size={18} className="text-zinc-500" />
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3">
          <button
            onClick={() => setTab('library')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'library' ? 'bg-pink-600 text-white' : 'bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10'}`}
          >From your library</button>
          <button
            onClick={() => setTab('upload')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'upload' ? 'bg-pink-600 text-white' : 'bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10'}`}
          >Upload a file</button>
        </div>

        {error && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'library' ? (
            loading ? (
              <div className="flex items-center justify-center py-12 text-zinc-500">
                <Loader2 size={20} className="animate-spin mr-2" /> Loading your tracks…
              </div>
            ) : songs.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-sm">
                No finished tracks yet. Generate something first, then come back.
              </div>
            ) : (
              <ul className="space-y-1">
                {songs.map((song) => (
                  <li key={song.id}>
                    <button
                      onClick={() => stageFromTrack(song)}
                      disabled={busyId === song.id}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-zinc-100 dark:hover:bg-white/5 disabled:opacity-50"
                    >
                      <Music2 size={16} className="text-zinc-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">{song.title || `Track #${song.id}`}</div>
                        {song.style && <div className="text-[11px] text-zinc-500 truncate">{song.style}</div>}
                      </div>
                      {busyId === song.id && <Loader2 size={14} className="animate-spin text-pink-500" />}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) stageFromFile(f);
              }}
              onClick={() => fileInput.current?.click()}
              className={`flex flex-col items-center justify-center py-12 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${dragOver ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/10' : 'border-zinc-300 dark:border-white/15 hover:border-zinc-400 dark:hover:border-white/25'}`}
            >
              {uploading ? (
                <>
                  <Loader2 size={28} className="animate-spin text-pink-500 mb-2" />
                  <div className="text-sm text-zinc-600 dark:text-zinc-300">Uploading…</div>
                </>
              ) : (
                <>
                  <Upload size={28} className="text-zinc-400 mb-2" />
                  <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Drop an audio file</div>
                  <div className="text-[11px] text-zinc-500 mt-1">MP3, WAV, FLAC, or M4A · up to 30MB</div>
                </>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="audio/mpeg,audio/wav,audio/flac,audio/x-m4a,audio/mp4,.mp3,.wav,.flac,.m4a"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) stageFromFile(f);
                  e.target.value = ''; // allow re-selecting the same file later
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
