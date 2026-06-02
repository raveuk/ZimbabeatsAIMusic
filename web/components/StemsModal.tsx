import React, { useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Download, Loader2, Mic, Drum, Music2, Speaker } from 'lucide-react';
import { songsApi } from '../services/api';

interface StemsModalProps {
  songId: string;
  songTitle?: string;
  onClose: () => void;
}

type StemMap = Partial<Record<'vocals' | 'bass' | 'drums' | 'other', string>>;

const STEM_META: Array<{ key: keyof StemMap; label: string; icon: React.ReactNode; color: string }> = [
  { key: 'vocals', label: 'Vocals',          icon: <Mic     size={16} />, color: 'text-pink-400' },
  { key: 'bass',   label: 'Bass',            icon: <Speaker size={16} />, color: 'text-amber-400' },
  { key: 'drums',  label: 'Drums',           icon: <Drum    size={16} />, color: 'text-cyan-400' },
  { key: 'other',  label: 'Other (melodic)', icon: <Music2  size={16} />, color: 'text-violet-400' },
];

// Modal that runs Demucs on a finished track and renders each stem inline
// with a play/pause button + a Download link. Single backend call on mount;
// once the stems URLs land we hand them straight to <audio> elements.
export const StemsModal: React.FC<StemsModalProps> = ({ songId, songTitle, onClose }) => {
  const [busy, setBusy]   = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stems, setStems] = useState<StemMap>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await songsApi.extractStems(songId);
        if (cancelled) return;
        setStems(r.stems || {});
        if (!Object.keys(r.stems || {}).length) {
          setError('Backend returned no stems. ComfyUI may have produced unexpected output.');
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Stem extraction failed';
        setError(msg);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
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
            <div className="flex items-center gap-3 text-sm text-zinc-400 py-6 justify-center">
              <Loader2 size={18} className="animate-spin" />
              <span>Running Demucs (~15–60s on a 3090)…</span>
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

        <div className="px-5 py-3 border-t border-white/5 text-[11px] text-zinc-500">
          Powered by Demucs (htdemucs). Stems saved alongside the original track.
        </div>
      </div>
    </div>
  );
};
