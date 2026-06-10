// LandingPage — the unauthenticated front page at myuzika.com/.
//
// Top-to-bottom: <Nav> <Hero> <BannerCards> <ListenWall> <FeatureShowcase>
// <Personas> <Stats> <BuiltOn> <FAQ> <BottomCTA> <Footer>.
//
// Visitors can browse and listen without an account; every "do something"
// action (Generate, open a feature, expand a track) funnels through
// onSignInClick → the existing sign-in modal.
import React, { useEffect, useRef, useState } from 'react';
import {
  Music, Edit3, Film, Play, Pause, Sparkles, MoveRight, Mic, Layers, Wand2,
  Users, Headphones, Camera, Briefcase, ChevronDown, Zap, Award, Shield,
} from 'lucide-react';
import { songsApi, Song } from '../services/api';
import { AlbumCover } from './AlbumCover';

interface LandingPageProps {
  onSignInClick: () => void;
}

const QUICK_PROMPTS = [
  'Lo-fi study beats, mellow piano, soft rain',
  'Synthwave instrumental for night drives',
  'Trap with auto-tune vocals, dark and moody',
  'Acoustic indie folk, warm vocals',
];

export const LandingPage: React.FC<LandingPageProps> = ({ onSignInClick }) => {
  return (
    <div className="min-h-screen w-full bg-zinc-950 text-white overflow-y-auto">
      <Nav onSignInClick={onSignInClick} />
      <Hero onSignInClick={onSignInClick} />
      <BannerCards onSignInClick={onSignInClick} />
      <ListenWall onSignInClick={onSignInClick} />
      <FeatureShowcase onSignInClick={onSignInClick} />
      <Personas />
      <StatsStrip />
      <BuiltOn />
      <FAQ />
      <BottomCTA onSignInClick={onSignInClick} />
      <Footer />
    </div>
  );
};

// ============================================================
// Nav
// ============================================================
const Nav: React.FC<{ onSignInClick: () => void }> = ({ onSignInClick }) => (
  <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-zinc-950/70 border-b border-white/5">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="text-lg font-bold tracking-tight">Myuzika</span>
      </div>
      <div className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
        <a href="#listen" className="hover:text-white transition">Listen</a>
        <a href="#features" className="hover:text-white transition">Features</a>
        <a href="#faq" className="hover:text-white transition">FAQ</a>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onSignInClick} className="px-4 py-1.5 text-sm font-medium text-zinc-300 hover:text-white transition">
          Sign In
        </button>
        <button
          onClick={onSignInClick}
          className="px-4 py-1.5 text-sm font-semibold rounded-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white transition shadow-lg shadow-pink-500/20"
        >
          Sign Up
        </button>
      </div>
    </div>
  </nav>
);

// ============================================================
// Hero — animated gradient blobs + interactive prompt input
// ============================================================
const Hero: React.FC<{ onSignInClick: () => void }> = ({ onSignInClick }) => {
  const [prompt, setPrompt] = useState('');
  return (
    <section className="relative pt-32 pb-20 px-4 sm:px-6 overflow-hidden">
      {/* Three animated radial gradient blobs */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[80vw] h-[60vh] blur-3xl animate-pulse"
          style={{ background: 'radial-gradient(ellipse at center, rgba(236,72,153,0.25), rgba(147,51,234,0.10), transparent 70%)' }}
        />
        <div
          className="absolute top-40 -left-20 w-[40vw] h-[40vw] blur-3xl opacity-50"
          style={{ background: 'radial-gradient(circle at center, rgba(59,130,246,0.20), transparent 60%)' }}
        />
        <div
          className="absolute top-20 -right-20 w-[40vw] h-[40vw] blur-3xl opacity-60"
          style={{ background: 'radial-gradient(circle at center, rgba(236,72,153,0.20), transparent 60%)' }}
        />
        {/* Faint grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      <div className="max-w-5xl mx-auto text-center relative">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-white/10 bg-white/5 text-xs text-zinc-300 backdrop-blur-sm">
          <Sparkles size={14} className="text-pink-400" />
          Free in beta — unlimited tracks while we're early
        </div>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.05] bg-gradient-to-b from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
          Make any song
          <br />
          <span className="bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">you can imagine.</span>
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-base sm:text-lg text-zinc-400 leading-relaxed">
          AI vocals, real stems, and AI music videos in early beta.
          <br className="hidden sm:inline" />
          Generate a track in 60 seconds, edit it like a pro, then bring it to life on video.
        </p>

        {/* Prompt input */}
        <div className="mt-10 max-w-2xl mx-auto">
          <div className="relative rounded-2xl bg-zinc-900/70 border border-white/10 shadow-2xl shadow-black/40 backdrop-blur-sm group focus-within:border-pink-500/40 focus-within:shadow-pink-500/10 transition">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the song you want to make…"
              rows={3}
              className="w-full bg-transparent p-4 pb-14 text-sm sm:text-base text-white placeholder:text-zinc-500 focus:outline-none resize-none"
            />
            <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 border border-white/10">
                <Mic size={11} />
                <span>Vocals on</span>
              </span>
              <span className="hidden sm:inline">{prompt.length}/500</span>
            </div>
            <div className="absolute bottom-3 right-3">
              <button
                onClick={onSignInClick}
                className="px-5 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white text-sm font-semibold flex items-center gap-2 transition shadow-lg shadow-pink-500/20"
              >
                <Sparkles size={14} />
                Generate
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                className="px-3 py-1.5 text-xs rounded-full bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white transition"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Hero stat row */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-xs uppercase tracking-wider text-zinc-500">
          <div>🎵 vocals + instrumental</div>
          <div className="hidden sm:block">·</div>
          <div>🎚️ real demucs stems</div>
          <div className="hidden sm:block">·</div>
          <div>🎬 ai music videos <span className="text-pink-400 normal-case ml-1">(early beta)</span></div>
          <div className="hidden sm:block">·</div>
          <div>🌍 en / 中文 / 日本語 / 한국어</div>
          <div className="hidden sm:block">·</div>
          <div>🔓 fully self-hosted</div>
        </div>
      </div>
    </section>
  );
};

// ============================================================
// Banner cards — Suno-style "What's new" rail (2 big cards)
// ============================================================
const BannerCards: React.FC<{ onSignInClick: () => void }> = ({ onSignInClick }) => (
  <section className="px-4 sm:px-6 pb-12">
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Card 1 — AI Music Video (early beta) */}
      <button
        onClick={onSignInClick}
        className="group relative text-left rounded-3xl p-8 overflow-hidden border border-white/10 hover:border-white/30 transition min-h-[260px] flex flex-col justify-end"
        style={{
          background:
            'radial-gradient(circle at 100% 0%, rgba(236,72,153,0.4), transparent 60%),' +
            ' radial-gradient(circle at 0% 100%, rgba(147,51,234,0.4), transparent 60%),' +
            ' linear-gradient(135deg, #1a0a1f 0%, #0a0a13 100%)',
        }}
      >
        <div className="absolute top-5 left-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/90 text-white text-[10px] font-bold uppercase tracking-wide">
          Early Beta
        </div>
        <div className="absolute top-1/2 right-8 -translate-y-1/2 opacity-20 group-hover:opacity-40 transition">
          <Film size={120} strokeWidth={1} />
        </div>
        <h3 className="text-2xl font-bold mb-2">Music videos from<br/>your tracks.</h3>
        <p className="text-sm text-zinc-300 max-w-xs">
          Upload a face, write a scene, get a short clip back. Early beta — short clips, ~5–15 s for now.
        </p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-pink-300 group-hover:gap-2 transition-all">
          Try AI Video <MoveRight size={14} />
        </span>
      </button>

      {/* Card 2 — Real stems editor */}
      <button
        onClick={onSignInClick}
        className="group relative text-left rounded-3xl p-8 overflow-hidden border border-white/10 hover:border-white/30 transition min-h-[260px] flex flex-col justify-end"
        style={{
          background:
            'radial-gradient(circle at 0% 0%, rgba(59,130,246,0.4), transparent 60%),' +
            ' radial-gradient(circle at 100% 100%, rgba(16,185,129,0.3), transparent 60%),' +
            ' linear-gradient(135deg, #0a1320 0%, #0a0a13 100%)',
        }}
      >
        <div className="absolute top-5 left-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/90 text-white text-[10px] font-bold uppercase tracking-wide">
          MultiTrack
        </div>
        <div className="absolute top-1/2 right-8 -translate-y-1/2 opacity-20 group-hover:opacity-40 transition">
          <Layers size={120} strokeWidth={1} />
        </div>
        <h3 className="text-2xl font-bold mb-2">Real stems.<br/>One channel each.</h3>
        <p className="text-sm text-zinc-300 max-w-xs">
          Demucs splits drums, bass, vocals, guitar, piano. Edit each channel like a DAW — no extraction queue.
        </p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-300 group-hover:gap-2 transition-all">
          Open the editor <MoveRight size={14} />
        </span>
      </button>
    </div>
  </section>
);

// ============================================================
// Listen wall — rich track cards with play overlay + meta
// ============================================================
const ListenWall: React.FC<{ onSignInClick: () => void }> = ({ onSignInClick }) => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const featured = await songsApi.getFeaturedSongs().catch(() => null);
        let list = featured?.songs || [];
        if (!list.length) {
          const pub = await songsApi.getPublicSongs(12, 0);
          list = pub.songs || [];
        }
        if (alive) setSongs(list.slice(0, 12));
      } catch (e) {
        console.error('failed to load featured songs', e);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handlePlay = (song: Song) => {
    if (!song.audioUrl) return;
    if (playingId === song.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(song.audioUrl);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(song.id);
  };

  if (!songs.length) return null;

  return (
    <section id="listen" className="px-4 sm:px-6 py-20 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-pink-400 font-semibold mb-2">Listen first</div>
            <h2 className="text-3xl sm:text-4xl font-bold">Hear what's possible.</h2>
            <p className="text-zinc-400 mt-2 text-sm sm:text-base max-w-xl">
              Every track on this page was made on Myuzika. Click any cover to play.
            </p>
          </div>
          <button
            onClick={onSignInClick}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 hover:border-white/30 text-sm text-zinc-300 hover:text-white transition"
          >
            Make your own <MoveRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {songs.map((song) => (
            <div
              key={song.id}
              onClick={() => handlePlay(song)}
              className="group relative aspect-square rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 hover:border-pink-500/40 hover:shadow-2xl hover:shadow-pink-500/10 transition cursor-pointer hover:-translate-y-1 duration-300"
            >
              {song.coverUrl ? (
                <img src={song.coverUrl} alt={song.title} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0"><AlbumCover seed={song.id} size="full" /></div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

              <div
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-pink-500 hover:bg-pink-400 flex items-center justify-center text-white shadow-2xl shadow-pink-500/40 transition-all duration-300 ${
                  playingId === song.id ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100'
                }`}
              >
                {playingId === song.id ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" className="translate-x-0.5" />}
              </div>

              <div className="absolute bottom-0 inset-x-0 p-3.5">
                <div className="text-sm font-semibold text-white truncate">{song.title || 'Untitled'}</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="text-[11px] text-zinc-400 truncate flex-1">{song.creator || 'someone'}</div>
                  {song.style && <div className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-zinc-300 truncate max-w-[60%]">{song.style.split(',')[0]}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ============================================================
// Feature showcase — 3 alternating-side big sections
// ============================================================
type Showcase = {
  badge: string;
  title: React.ReactNode;
  desc: string;
  bullets: string[];
  cta: string;
  visualBg: string;
  visualIcon: React.ReactNode;
};

const SHOWCASES: Showcase[] = [
  {
    badge: 'Generate',
    title: <>Full songs.<br/>From one prompt.</>,
    desc: 'Vocals and instrumental together in 60-90 seconds on our 3090. Pick a style preset, set BPM and key, or just describe the vibe.',
    bullets: ['Studio + Turbo models', 'Up to 4-minute tracks', 'Re-roll seeds until you love it', 'Custom vocal language'],
    cta: 'Generate a track',
    visualBg: 'radial-gradient(circle at 30% 30%, rgba(236,72,153,0.5), transparent 60%), radial-gradient(circle at 70% 70%, rgba(147,51,234,0.4), transparent 60%), #0a0a13',
    visualIcon: <Music size={180} strokeWidth={0.7} className="text-pink-300/40" />,
  },
  {
    badge: 'Edit',
    title: <>A real editor.<br/>In your browser.</>,
    desc: 'Open any track in the AudioMass MultiTrack editor — drums, bass, vocals on their own channels. Trim, fade, EQ, crossfade, bounce back to MP3.',
    bullets: ['Waveform timeline', 'Demucs stem isolation', 'Save / Save As round-trip', 'EQ + compressor + reverb'],
    cta: 'Open the editor',
    visualBg: 'radial-gradient(circle at 30% 30%, rgba(59,130,246,0.5), transparent 60%), radial-gradient(circle at 70% 70%, rgba(16,185,129,0.3), transparent 60%), #0a0e1a',
    visualIcon: <Layers size={180} strokeWidth={0.7} className="text-blue-300/40" />,
  },
  {
    badge: 'Animate · Early Beta',
    title: <>Turn it into<br/>a music video.</>,
    desc: 'Pick a track, upload a reference image, type a scene. Wan 2.2 S2V renders a short clip where the subject sings along. Early beta — expect short clips and rough lip-sync today; longer + cleaner is on the roadmap.',
    bullets: ['Audio-driven lip sync (early)', 'Reference image → motion', 'Short clips (~5–15 s today)', 'Free during beta'],
    cta: 'Try the early beta',
    visualBg: 'radial-gradient(circle at 30% 30%, rgba(236,72,153,0.5), transparent 60%), radial-gradient(circle at 70% 70%, rgba(244,114,182,0.3), transparent 60%), #1a0a13',
    visualIcon: <Film size={180} strokeWidth={0.7} className="text-pink-300/40" />,
  },
];

const FeatureShowcase: React.FC<{ onSignInClick: () => void }> = ({ onSignInClick }) => (
  <section id="features" className="px-4 sm:px-6 py-20 border-t border-white/5">
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-16">
        <div className="text-xs uppercase tracking-wider text-pink-400 font-semibold mb-2">The toolkit</div>
        <h2 className="text-3xl sm:text-4xl font-bold">Everything you need, in one tab.</h2>
      </div>
      <div className="space-y-8">
        {SHOWCASES.map((s, idx) => (
          <div
            key={s.badge}
            className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-center rounded-3xl p-8 lg:p-12 bg-zinc-900/40 border border-white/5 hover:border-white/10 transition`}
          >
            <div className={idx % 2 === 1 ? 'lg:order-2' : ''}>
              <div className="inline-block px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] uppercase tracking-wider font-semibold text-pink-300 mb-4">
                {s.badge}
              </div>
              <h3 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">{s.title}</h3>
              <p className="text-zinc-400 leading-relaxed mb-6 text-base">{s.desc}</p>
              <ul className="space-y-2.5 mb-6">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-sm text-zinc-300">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-pink-400 flex-shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={onSignInClick}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition"
              >
                {s.cta} <MoveRight size={14} />
              </button>
            </div>
            <div className={`relative aspect-[4/3] rounded-2xl overflow-hidden flex items-center justify-center ${idx % 2 === 1 ? 'lg:order-1' : ''}`}
              style={{ background: s.visualBg }}>
              <div className="opacity-60">{s.visualIcon}</div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ============================================================
// Personas — who is this for?
// ============================================================
const PERSONAS: { icon: React.ReactNode; title: string; desc: string }[] = [
  { icon: <Headphones size={22} />, title: 'Beatmakers', desc: 'Free stems for instant remix or sampling fodder.' },
  { icon: <Mic size={22} />, title: 'Songwriters', desc: 'Sketch a vibe, hear it sung back in seconds.' },
  { icon: <Camera size={22} />, title: 'Content Creators', desc: 'Royalty-free background tracks + music videos.' },
  { icon: <Briefcase size={22} />, title: 'Producers', desc: 'Generate references, pitch ideas, A/B vocal takes.' },
  { icon: <Users size={22} />, title: 'Hobbyists', desc: 'No DAW, no theory — just type and listen.' },
  { icon: <Wand2 size={22} />, title: 'Educators', desc: 'Demo genres, voicings, BPMs on the fly in class.' },
];

const Personas: React.FC = () => (
  <section className="px-4 sm:px-6 py-20 border-t border-white/5">
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <div className="text-xs uppercase tracking-wider text-pink-400 font-semibold mb-2">Built for</div>
        <h2 className="text-3xl sm:text-4xl font-bold">Whoever you are.</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {PERSONAS.map((p) => (
          <div key={p.title} className="p-5 rounded-2xl bg-zinc-900/40 border border-white/5 hover:border-white/20 hover:bg-zinc-900 transition">
            <div className="inline-flex p-2.5 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-600/20 text-pink-300 mb-3">{p.icon}</div>
            <h3 className="text-base font-bold mb-1">{p.title}</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">{p.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ============================================================
// Stats strip
// ============================================================
const STATS = [
  { value: '60s', label: 'avg time to first track' },
  { value: '6', label: 'real Demucs stems per song' },
  { value: '4', label: 'UI languages (en · 中 · 日 · 한)' },
  { value: '∞', label: 'tracks during beta' },
];

const StatsStrip: React.FC = () => (
  <section className="px-4 sm:px-6 py-16 border-t border-white/5 bg-gradient-to-r from-pink-500/[0.03] to-purple-600/[0.03]">
    <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
      {STATS.map((s) => (
        <div key={s.label}>
          <div className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent mb-1">
            {s.value}
          </div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">{s.label}</div>
        </div>
      ))}
    </div>
  </section>
);

// ============================================================
// Built On
// ============================================================
const BUILT_ON = [
  { name: 'ACE-Step 1.5', sub: 'music diffusion' },
  { name: 'Wan 2.2 S2V', sub: 'audio → video' },
  { name: 'Demucs (htdemucs)', sub: 'stem separation' },
  { name: 'AudioMass', sub: 'in-browser editor' },
];

const BuiltOn: React.FC = () => (
  <section className="px-4 sm:px-6 py-16 border-t border-white/5">
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2">Powered by</div>
        <p className="text-zinc-400 text-sm">Open-source models, running on our GPU. No proprietary lock-in.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {BUILT_ON.map((m) => (
          <div key={m.name} className="text-center p-5 rounded-2xl border border-white/5 bg-zinc-900/30 hover:border-white/20 transition">
            <div className="text-base font-bold mb-1">{m.name}</div>
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">{m.sub}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ============================================================
// FAQ — accordion
// ============================================================
const FAQS = [
  {
    q: 'Is it really free?',
    a: 'Yes — while we\'re in beta. No credit card, no usage caps. We run inference on our own GPUs. If we ever introduce paid tiers, your beta account stays free for what you already use.',
  },
  {
    q: 'Who owns the music I make?',
    a: 'You do. Tracks you generate are yours to use commercially or non-commercially. Underlying models are open-source, so there is no rights-encumbered output.',
  },
  {
    q: 'How long does a song take?',
    a: 'Roughly 60–90 seconds for a 2–3 minute track at default settings (Studio model, 30 inference steps, on a single 3090). Faster on Turbo.',
  },
  {
    q: 'Can I edit lyrics or just the vibe?',
    a: 'Both. Custom mode lets you write or paste exact lyrics; Simple mode generates them from a description. You can also re-roll vocals on a finished track.',
  },
  {
    q: 'Does the editor really do stems?',
    a: 'Yes — real Demucs separation, not a fake. Each track in your library can be split into drums / bass / vocals / other / guitar / piano channels, then edited like a DAW.',
  },
  {
    q: 'What about the music videos?',
    a: 'AI Video is in early beta. Pick a finished track, upload a reference image (a face works best), type a scene prompt — Wan 2.2 S2V renders a short clip (~5–15 s today) where the subject mouths to the song. Lip-sync is rough at this stage and clip lengths are short; longer + cleaner versions are on the roadmap.',
  },
];

const FAQ: React.FC = () => {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="px-4 sm:px-6 py-20 border-t border-white/5">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-wider text-pink-400 font-semibold mb-2">Questions</div>
          <h2 className="text-3xl sm:text-4xl font-bold">Probably yours, too.</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <div key={f.q} className="rounded-2xl border border-white/5 bg-zinc-900/40 overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-zinc-900/80 transition"
              >
                <span className="font-semibold text-white">{f.q}</span>
                <ChevronDown
                  size={20}
                  className={`text-zinc-400 flex-shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`}
                />
              </button>
              {open === i && (
                <div className="px-5 pb-5 text-sm text-zinc-400 leading-relaxed">{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ============================================================
// Bottom CTA
// ============================================================
const BottomCTA: React.FC<{ onSignInClick: () => void }> = ({ onSignInClick }) => (
  <section className="relative px-4 sm:px-6 py-28 border-t border-white/5 overflow-hidden">
    <div className="absolute inset-0 -z-10">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(236,72,153,0.20), transparent 60%),' +
            ' radial-gradient(circle at 10% 100%, rgba(147,51,234,0.20), transparent 60%)',
        }}
      />
    </div>
    <div className="max-w-2xl mx-auto text-center relative">
      <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">
        Your first track is waiting.
      </h2>
      <p className="mt-4 text-zinc-400 text-base sm:text-lg">
        Free in beta. No credit card. Sign in with Google in one click.
      </p>
      <button
        onClick={onSignInClick}
        className="mt-10 inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white text-base font-semibold shadow-2xl shadow-pink-500/30 transition hover:scale-105"
      >
        Start creating free <MoveRight size={18} />
      </button>
      <div className="mt-8 flex items-center justify-center gap-6 text-xs text-zinc-500">
        <div className="flex items-center gap-1.5"><Shield size={12} /> No payment info</div>
        <div className="flex items-center gap-1.5"><Zap size={12} /> Instant access</div>
        <div className="flex items-center gap-1.5"><Award size={12} /> You own the output</div>
      </div>
    </div>
  </section>
);

// ============================================================
// Footer
// ============================================================
const Footer: React.FC = () => (
  <footer className="px-4 sm:px-6 py-12 border-t border-white/5 bg-black/40">
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" />
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" />
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <div className="font-bold">Myuzika</div>
            <div className="text-xs text-zinc-500">Built on open-source music + video models</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-400">
          <a href="https://github.com/raveuk/ZimbabeatsAIMusic" target="_blank" rel="noreferrer" className="hover:text-white transition">GitHub</a>
          <a href="mailto:hello@myuzika.com" className="hover:text-white transition">Contact</a>
          <a href="/privacy" className="hover:text-white transition">Privacy</a>
          <a href="/terms" className="hover:text-white transition">Terms</a>
        </div>
      </div>
      <div className="mt-8 pt-6 border-t border-white/5 text-xs text-zinc-600">
        © {new Date().getFullYear()} Myuzika · Inference runs on a single NVIDIA RTX 3090
      </div>
    </div>
  </footer>
);

export default LandingPage;
