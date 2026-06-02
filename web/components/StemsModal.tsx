import React, { useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Download, Loader2, Mic, Drum, Music2, Speaker, Guitar, Piano } from 'lucide-react';
import { songsApi } from '../services/api';

interface StemsModalProps {
  songId: string;
  songTitle?: string;
  onClose: () => void;
}

type StemKey = 'vocals' | 'drums' | 'bass' | 'other' | 'guitar' | 'piano';
type StemMap = Partial<Record<StemKey, string>>;

// 6-stem layout from htdemucs_6s. The 4-stem model never produces guitar /
// piano files — those rows just render as "unavailable" on tracks split
// with the smaller model.
const STEM_META: Array<{ key: StemKey; label: string; icon: React.ReactNode; color: string }> = [
  { key: 'vocals', label: 'Vocals',          icon: <Mic     size={16} />, color: 'text-pink-400' },
  { key: 'drums',  label: 'Drums',           icon: <Drum    size={16} />, color: 'text-cyan-400' },
  { key: 'bass',   label: 'Bass',            icon: <Speaker size={16} />, color: 'text-amber-400' },
  { key: 'other',  label: 'Other (melodic)', icon: <Music2  size={16} />, color: 'text-violet-400' },
  { key: 'guitar', label: 'Guitar',          icon: <Guitar  size={16} />, color: 'text-emerald-400' },
  { key: 'piano',  label: 'Piano',           icon: <Piano   size={16} />, color: 'text-sky-400' },
];

// Modal that runs Demucs on a finished track and renders each stem inline
// with a play/pause button + a Download link. Single backend call on mount;
// once the stems URLs land we hand them straight to <audio> elements.
export const StemsModal: React.FC<StemsModalProps> = ({ songId, songTitle, onClose }) => {
  const [busy, setBusy]   = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stems, setStems] = useState<StemMap>({});
  const [playing, setPlaying] = useState<string | null>(null);
  // Elapsed-seconds counter shown while extracting. Resets when the modal opens.
  const [elapsed, setElapsed] = useState(0);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    const tick = setInterval(() => {
      if (!cancelled) setElapsed(Math.round((Date.now() - startedAt) / 1000));
    }, 250);
    (async () => {
      try {
        const r = await songsApi.extractStems(songId);
        if (cancelled) return;
        setStems(r.stems || {});
        if (!Object.keys(r.stems || {}).length) {
          setError('No stems returned. Try again or pick a different track.');
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Stem extraction failed';
        setError(msg);
      } finally {
        if (!cancelled) { setBusy(false); clearInterval(tick); }
      }
    })();
    return () => { cancelled = true; clearInterval(tick); };
  }, [songId]);

  const togglePlay = (key: string) => {
    const target = audioRefs.current[key];
    if (!target) return;
    // Pause any other stem first so playback is mutually exclusive.
    for (const [k, el] of Object.entries(audioRefs.current)) {
      if (k !== key && el && !el.paused) el.pause();
    }
    if (target.paused) { target.play(); setPlaying(key); }
    else               { target.pause(); setPlaying(null); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-zinc-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h2 className="text-sm font-bold text-white">Extract Stems</h2>
            {songTitle && <p className="text-xs text-zinc-500 truncate">{songTitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {busy && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={22} className="animate-spin text-pink-400" />
              <div className="text-sm text-zinc-300">Extracting stems…</div>
              <div className="text-xs text-zinc-500 tabular-nums">
                {Math.floor(elapsed / 60).toString().padStart(2, '0')}:
                {(elapsed % 60).toString().padStart(2, '0')}
              </div>
            </div>
          )}

          {!busy && error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
              {error}
            </div>
          )}

          {!busy && !error && STEM_META.map(({ key, label, icon, color }) => {
            const url = stems[key];
            if (!url) return (
              <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 opacity-50">
                <span className={color}>{icon}</span>
                <span className="text-sm font-medium text-zinc-400 flex-1">{label}</span>
                <span className="text-xs text-zinc-500">unavailable</span>
              </div>
            );
            const isPlaying = playing === key;
            return (
              <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                <span className={color}>{icon}</span>
                <span className="text-sm font-medium text-white flex-1">{label}</span>
                <audio
                  ref={(el) => { audioRefs.current[key] = el; }}
                  src={url}
                  onEnded={() => setPlaying((p) => (p === key ? null : p))}
                  preload="none"
                />
                <button
                  onClick={() => togglePlay(key)}
                  className="w-8 h-8 rounded-full bg-pink-600 hover:bg-pink-500 flex items-center justify-center text-white"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" />}
                </button>
                <a
                  href={url}
                  download={`${songTitle || `track-${songId}`}-${key}.mp3`}
                  className="w-8 h-8 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-white"
                  title="Download"
                >
                  <Download size={14} />
                </a>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};
