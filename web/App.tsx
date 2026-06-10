import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { CreatePanel } from './components/CreatePanel';
import { SongList } from './components/SongList';
import { RightSidebar } from './components/RightSidebar';
import { Player } from './components/Player';
import { LibraryView } from './components/LibraryView';
import { CreatePlaylistModal, AddToPlaylistModal } from './components/PlaylistModals';
import { VideoGeneratorModal } from './components/VideoGeneratorModal';
import { UsernameModal } from './components/UsernameModal';
import { UserProfile } from './components/UserProfile';
import { SettingsModal } from './components/SettingsModal';
import { SongProfile } from './components/SongProfile';
import { Song, GenerationParams, View, Playlist } from './types';
import { generateApi, songsApi, playlistsApi, getAudioUrl, API_BASE } from './services/api';
import { useAuth } from './context/AuthContext';
import { useResponsive } from './context/ResponsiveContext';
import { I18nProvider, useI18n } from './context/I18nContext';
import { List } from 'lucide-react';
import { PlaylistDetail } from './components/PlaylistDetail';
import { Toast, ToastType } from './components/Toast';
import { SearchPage } from './components/SearchPage';
import { TrainingPanel } from './components/TrainingPanel';
import MusicVideoPanel from './components/MusicVideoPanel';
import { NewsPage } from './components/NewsPage';
import { ConfirmDialog } from './components/ConfirmDialog';
import { LandingPage } from './components/LandingPage';


function AppContent() {
  // i18n
  const { t } = useI18n();

  // Responsive
  const { isMobile, isDesktop } = useResponsive();

  // Auth
  const { user, token, isAuthenticated, isLoading: authLoading, setupUser, logout } = useAuth();
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  // Track multiple concurrent generation jobs
  const activeJobsRef = useRef<Map<string, { tempId: string; pollInterval: ReturnType<typeof setInterval> }>>(new Map());
  const [activeJobCount, setActiveJobCount] = useState(0);

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Navigation State - default to create view
  const [currentView, setCurrentView] = useState<View>('create');

  // Content State
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedSongIds, setLikedSongIds] = useState<Set<string>>(new Set());
  const [referenceTracks, setReferenceTracks] = useState<ReferenceTrack[]>([]);
  const [playQueue, setPlayQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);

  // Selection State
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  // Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const stored = localStorage.getItem('volume');
    return stored ? parseFloat(stored) : 0.8;
  });
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'all' | 'one'>('all');

  // UI State
  const [isGenerating, setIsGenerating] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  // CreatePanel width is user-resizable on desktop via the vertical divider.
  // Clamped to [240, 560] px and persisted across sessions.
  const [createPanelWidth, setCreatePanelWidth] = useState<number>(() => {
    const stored = parseInt(localStorage.getItem('createPanelWidth') || '', 10);
    return Number.isFinite(stored) && stored >= 240 && stored <= 560 ? stored : 360;
  });
  const createPanelResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const [pendingAudioSelection, setPendingAudioSelection] = useState<{ target: 'reference' | 'source' | 'edit'; url: string; title?: string } | null>(null);

  // Mobile UI Toggle
  const [mobileShowList, setMobileShowList] = useState(false);

  // Modals
  const [isCreatePlaylistModalOpen, setIsCreatePlaylistModalOpen] = useState(false);
  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [songToAddToPlaylist, setSongToAddToPlaylist] = useState<Song | null>(null);

  // Video Modal
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [songForVideo, setSongForVideo] = useState<Song | null>(null);

  // Settings Modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Profile View
  const [viewingUsername, setViewingUsername] = useState<string | null>(null);

  // Song View
  const [viewingSongId, setViewingSongId] = useState<string | null>(null);

  // Playlist View
  const [viewingPlaylistId, setViewingPlaylistId] = useState<string | null>(null);

  // Reuse State
  const [reuseData, setReuseData] = useState<{ song: Song, timestamp: number } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectedSongRef = useRef<Song | null>(null);
  const currentSongIdRef = useRef<string | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const playNextRef = useRef<() => void>(() => {});

  // Mobile Details Modal State
  const [showMobileDetails, setShowMobileDetails] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false,
  });

  // Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  interface ReferenceTrack {
    id: string;
    filename: string;
    storage_key: string;
    duration: number | null;
    file_size_bytes: number | null;
    tags: string[] | null;
    created_at: string;
    audio_url: string;
  }

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type, isVisible: true });
  };

  const closeToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  // Auto-popup the sign-in modal when unauthenticated. The marketing
  // landing lives at /welcome (see below) so root visitors continue to
  // get the original gate-first experience.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === '/welcome') return; // landing owns its own modal
    if (!authLoading && !isAuthenticated) {
      setShowUsernameModal(true);
    }
  }, [authLoading, isAuthenticated]);

  // Load Playlists
  useEffect(() => {
    if (token) {
      playlistsApi.getMyPlaylists(token)
        .then(res => setPlaylists(res.playlists))
        .catch(err => console.error('Failed to load playlists', err));
    } else {
      setPlaylists([]);
    }
  }, [token]);

  // Keep selectedSongRef in sync for use in callbacks without stale closures
  useEffect(() => { selectedSongRef.current = selectedSong; }, [selectedSong]);

  // Cleanup active jobs on unmount
  useEffect(() => {
    return () => {
      // Clear all polling intervals when component unmounts
      activeJobsRef.current.forEach(({ pollInterval }) => {
        clearInterval(pollInterval);
      });
      activeJobsRef.current.clear();
    };
  }, []);

  const handleShowDetails = (song: Song) => {
    setSelectedSong(song);
    setShowMobileDetails(true);
  };

  // Reuse Handler
  const handleReuse = (song: Song) => {
    setReuseData({ song, timestamp: Date.now() });
    setCurrentView('create');
    setMobileShowList(false);
  };

  // Song Update Handler
  const handleSongUpdate = (updatedSong: Song) => {
    setSongs(prev => prev.map(s => s.id === updatedSong.id ? updatedSong : s));
    if (currentSong?.id === updatedSong.id) {
      setCurrentSong(updatedSong);
    }
    if (selectedSong?.id === updatedSong.id) {
      setSelectedSong(updatedSong);
    }
  };

  // Navigate to Profile Handler
  const handleNavigateToProfile = (username: string) => {
    setViewingUsername(username);
    setCurrentView('profile');
    window.history.pushState({}, '', `/@${username}`);
  };

  // Back from Profile Handler
  const handleBackFromProfile = () => {
    setViewingUsername(null);
    setCurrentView('create');
    window.history.pushState({}, '', '/');
  };

  // Navigate to Song Handler
  const handleNavigateToSong = (songId: string) => {
    setViewingSongId(songId);
    setCurrentView('song');
    window.history.pushState({}, '', `/song/${songId}`);
  };

  // Back from Song Handler
  const handleBackFromSong = () => {
    setViewingSongId(null);
    setCurrentView('create');
    window.history.pushState({}, '', '/');
  };

  // Theme Effect
  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // URL Routing Effect
  useEffect(() => {
    const handleUrlChange = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);

      // Handle ?song= query parameter
      const songParam = params.get('song');
      if (songParam) {
        setViewingSongId(songParam);
        setCurrentView('song');
        window.history.replaceState({}, '', `/song/${songParam}`);
        return;
      }

      if (path === '/create' || path === '/') {
        setCurrentView('create');
        setMobileShowList(false);
      } else if (path === '/library') {
        setCurrentView('library');
      } else if (path.startsWith('/@')) {
        const username = path.substring(2);
        if (username) {
          setViewingUsername(username);
          setCurrentView('profile');
        }
      } else if (path.startsWith('/song/')) {
        const songId = path.substring(6);
        if (songId) {
          setViewingSongId(songId);
          setCurrentView('song');
        }
      } else if (path.startsWith('/playlist/')) {
        const playlistId = path.substring(10);
        if (playlistId) {
          setViewingPlaylistId(playlistId);
          setCurrentView('playlist');
        }
      } else if (path === '/search') {
        setCurrentView('search');
      } else if (path === '/news') {
        setCurrentView('news');
      }
    };

    handleUrlChange();

    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  // Load Songs Effect
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const loadSongs = async () => {
      try {
        const [mySongsRes, likedSongsRes] = await Promise.all([
          songsApi.getMySongs(token),
          songsApi.getLikedSongs(token)
        ]);

        const mapSong = (s: any): Song => ({
          id: s.id,
          title: s.title,
          lyrics: s.lyrics,
          style: s.style,
          // Real cover from /api/cover/[id] (pre-signed by services/api.ts);
          // picsum placeholder is a last resort while the cover is still
          // generating server-side (cover_url is undefined for ~5-8s after
          // the audio finishes but before the cover prompt does).
          coverUrl: s.cover_url || `https://picsum.photos/seed/${s.id}/400/400`,
          duration: s.duration && s.duration > 0 ? `${Math.floor(s.duration / 60)}:${String(Math.floor(s.duration % 60)).padStart(2, '0')}` : '0:00',
          createdAt: new Date(s.created_at || s.createdAt),
          tags: s.tags || [],
          audioUrl: getAudioUrl(s.audio_url, s.id),
          isPublic: s.is_public,
          likeCount: s.like_count || 0,
          viewCount: s.view_count || 0,
          userId: s.user_id,
          creator: s.creator,
          ditModel: s.ditModel,
          generationParams: (() => {
            try {
              if (!s.generation_params) return undefined;
              return typeof s.generation_params === 'string' ? JSON.parse(s.generation_params) : s.generation_params;
            } catch {
              return undefined;
            }
          })(),
        });

        const mySongs = mySongsRes.songs.map(mapSong);
        const likedSongs = likedSongsRes.songs.map(mapSong);

        const songsMap = new Map<string, Song>();
        [...mySongs, ...likedSongs].forEach(s => songsMap.set(s.id, s));

        // Preserve any generating songs (temp songs)
        setSongs(prev => {
          const generatingSongs = prev.filter(s => s.isGenerating);
          const loadedSongs = Array.from(songsMap.values());
          return [...generatingSongs, ...loadedSongs];
        });

        const likedIds = new Set(likedSongs.map(s => s.id));
        setLikedSongIds(likedIds);

      } catch (error) {
        console.error('Failed to load songs:', error);
      }
    };

    loadSongs();
  }, [isAuthenticated, token]);

  const loadReferenceTracks = useCallback(async () => {
    if (!isAuthenticated || !token) return;
    try {
      const response = await fetch(`${API_BASE}/api/reference-tracks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) return;
      const data = await response.json();
      setReferenceTracks(data.tracks || []);
    } catch (error) {
      console.error('Failed to load reference tracks:', error);
    }
  }, [isAuthenticated, token]);

  // Load reference tracks for Library
  useEffect(() => {
    loadReferenceTracks();
  }, [loadReferenceTracks]);

  useEffect(() => {
    if (currentView === 'library') {
      loadReferenceTracks();
    }
  }, [currentView, loadReferenceTracks]);

  // CreatePanel resize: mousedown on the divider seeds startX/startW, mousemove
  // recalculates width (clamped), mouseup commits to localStorage. Cursor +
  // user-select are forced globally during the drag so the page text doesn't
  // get accidentally selected.
  const onCreatePanelDragStart = useCallback((e: React.MouseEvent) => {
    createPanelResizeRef.current = { startX: e.clientX, startW: createPanelWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const r = createPanelResizeRef.current;
      if (!r) return;
      const next = Math.max(240, Math.min(560, r.startW + (ev.clientX - r.startX)));
      setCreatePanelWidth(next);
    };
    const onUp = () => {
      const r = createPanelResizeRef.current;
      createPanelResizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (r) {
        try { localStorage.setItem('createPanelWidth', String(Math.round(parseFloat(String(document.documentElement.style.getPropertyValue('--cp-w')) || '0') || 0))); } catch {}
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [createPanelWidth]);

  // Persist width on every change (simpler + survives sudden tab close).
  useEffect(() => {
    try { localStorage.setItem('createPanelWidth', String(createPanelWidth)); } catch {}
  }, [createPanelWidth]);

  // Player Logic
  const getActiveQueue = (song?: Song) => {
    if (playQueue.length > 0) return playQueue;
    if (song && songs.some(s => s.id === song.id)) return songs;
    return songs;
  };

  const playNext = useCallback(() => {
    if (!currentSong) return;
    const queue = getActiveQueue(currentSong);
    if (queue.length === 0) return;

    const currentIndex = queueIndex >= 0 && queue[queueIndex]?.id === currentSong.id
      ? queueIndex
      : queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex === -1) return;

    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }

    // Find next playable song (has audioUrl and not generating)
    const queueLen = queue.length;
    for (let i = 1; i <= queueLen; i++) {
      let nextIndex;
      if (isShuffle) {
        nextIndex = Math.floor(Math.random() * queueLen);
        if (queueLen > 1 && nextIndex === currentIndex) continue;
      } else {
        nextIndex = currentIndex + i;
        // In 'none' repeat mode, stop at end of queue
        if (repeatMode === 'none' && nextIndex >= queueLen) {
          setIsPlaying(false);
          return;
        }
        nextIndex = nextIndex % queueLen;
      }

      const candidate = queue[nextIndex];
      if (candidate.audioUrl && !candidate.isGenerating) {
        setQueueIndex(nextIndex);
        setCurrentSong(candidate);
        setIsPlaying(true);
        return;
      }
    }

    // No playable songs found
    setIsPlaying(false);
  }, [currentSong, queueIndex, isShuffle, repeatMode, playQueue, songs]);

  const playPrevious = useCallback(() => {
    if (!currentSong) return;
    const queue = getActiveQueue(currentSong);
    if (queue.length === 0) return;

    const currentIndex = queueIndex >= 0 && queue[queueIndex]?.id === currentSong.id
      ? queueIndex
      : queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex === -1) return;

    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }

    // Find previous playable song (has audioUrl and not generating)
    const queueLen = queue.length;
    for (let i = 1; i <= queueLen; i++) {
      let prevIndex;
      if (isShuffle) {
        prevIndex = Math.floor(Math.random() * queueLen);
        if (queueLen > 1 && prevIndex === currentIndex) continue;
      } else {
        prevIndex = currentIndex - i;
        // In 'none' repeat mode, stop at beginning of queue
        if (repeatMode === 'none' && prevIndex < 0) {
          if (audioRef.current) audioRef.current.currentTime = 0;
          return;
        }
        prevIndex = (prevIndex + queueLen) % queueLen;
      }

      const candidate = queue[prevIndex];
      if (candidate.audioUrl && !candidate.isGenerating) {
        setQueueIndex(prevIndex);
        setCurrentSong(candidate);
        setIsPlaying(true);
        return;
      }
    }

    // No playable songs found
    setIsPlaying(false);
  }, [currentSong, queueIndex, currentTime, isShuffle, repeatMode, playQueue, songs]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  // Audio Setup
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.crossOrigin = "anonymous";
    const audio = audioRef.current;
    audio.volume = volume;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const applyPendingSeek = () => {
      if (pendingSeekRef.current === null) return;
      if (audio.seekable.length === 0) return;
      const target = pendingSeekRef.current;
      const safeTarget = Number.isFinite(audio.duration)
        ? Math.min(Math.max(target, 0), audio.duration)
        : Math.max(target, 0);
      audio.currentTime = safeTarget;
      setCurrentTime(safeTarget);
      pendingSeekRef.current = null;
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      applyPendingSeek();
    };

    const onCanPlay = () => {
      applyPendingSeek();
    };

    const onProgress = () => {
      applyPendingSeek();
    };

    const onEnded = () => {
      playNextRef.current();
    };

    const onError = (e: Event) => {
      if (audio.error && audio.error.code !== 1) {
        console.error("Audio playback error:", audio.error);
        if (audio.error.code === 4) {
          showToast(t('songNotAvailable'), 'error');
        } else {
          showToast(t('unableToPlay'), 'error');
        }
      }
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('progress', onProgress);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('progress', onProgress);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  // Handle Playback State
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong?.audioUrl) return;

    const playAudio = async () => {
      try {
        await audio.play();
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error("Playback failed:", err);
          if (err.name === 'NotSupportedError') {
            showToast(t('songNotAvailable'), 'error');
          }
          setIsPlaying(false);
        }
      }
    };

    if (currentSongIdRef.current !== currentSong.id) {
      currentSongIdRef.current = currentSong.id;
      audio.src = currentSong.audioUrl;
      audio.load();
      if (isPlaying) playAudio();
    } else {
      if (isPlaying) playAudio();
      else audio.pause();
    }
  }, [currentSong, isPlaying]);

  // Handle Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    localStorage.setItem('volume', String(volume));
  }, [volume]);

  // Handle Playback Rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Spacebar play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      if (currentSong) {
        if (currentSong.audioUrl) {
          setIsPlaying(prev => !prev);
        }
      } else {
        // No song selected — play first available
        const available = songs.filter(s => s.audioUrl && !s.isGenerating);
        if (available.length > 0) {
          playSong(available[0], available);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSong, songs]);

  // Helper to cleanup a job and check if all jobs are done
  const cleanupJob = useCallback((jobId: string, _tempId: string) => {
    const jobData = activeJobsRef.current.get(jobId);
    if (jobData) {
      clearInterval(jobData.pollInterval);
      activeJobsRef.current.delete(jobId);
    }
    // Don't filter the row out — the song id IS the backend track id now
    // (handleGenerate no longer creates an optimistic temp). refreshSongsList
    // runs right after this cleanup and brings in the row with its final
    // status='done' shape (audioUrl, coverUrl, duration). Deleting here
    // would just cause a flash of "song gone, song back".
    setActiveJobCount(activeJobsRef.current.size);
    if (activeJobsRef.current.size === 0) {
      setIsGenerating(false);
    }
  }, []);

  // Refresh songs list (called when any job completes successfully)
  const refreshSongsList = useCallback(async () => {
    if (!token) return;
    try {
      const response = await songsApi.getMySongs(token);
      const loadedSongs: Song[] = response.songs.map(s => ({
        id: s.id,
        title: s.title,
        lyrics: s.lyrics,
        style: s.style,
        // Real cover from /api/cover/[id] (pre-signed by services/api.ts);
        // picsum placeholder only if cover isn't ready yet (rare 5-8s window
        // between audio-done and cover-done).
        coverUrl: s.cover_url || `https://picsum.photos/seed/${s.id}/400/400`,
        duration: s.duration && s.duration > 0 ? `${Math.floor(s.duration / 60)}:${String(Math.floor(s.duration % 60)).padStart(2, '0')}` : '0:00',
        createdAt: new Date(s.created_at),
        tags: s.tags || [],
        audioUrl: getAudioUrl(s.audio_url, s.id),
        isPublic: s.is_public,
        likeCount: s.like_count || 0,
        viewCount: s.view_count || 0,
        userId: s.user_id,
        creator: s.creator,
        ditModel: s.ditModel,
        // Carry generation state through so queued/running rows render as
        // "Creating…" with a live percentage in SongList. Without these three
        // fields, the remap drops the flags toFspeciiSong sets — and the row
        // appears as a completed song with title + 0:00 duration even though
        // the backend status is still 'running'.
        isGenerating: (s as any).isGenerating,
        progress: (s as any).progress,
        queuePosition: (s as any).queuePosition,
        generationParams: (() => {
          try {
            if (!s.generation_params) return undefined;
            return typeof s.generation_params === 'string' ? JSON.parse(s.generation_params) : s.generation_params;
          } catch {
            return undefined;
          }
        })(),
      }));

      // Merge backend rows against the currently-displayed list. Since
      // handleGenerate now re-keys the optimistic temp to the real track-id,
      // ids match across both sides. When the backend version is still
      // generating (queued/running), keep the temp's polling-updated
      // progress/stage on top of any newer backend fields. When the backend
      // says done, take the backend version wholesale so audioUrl/coverUrl
      // resolve.
      setSongs(prev => {
        const prevById = new Map(prev.map(s => [s.id, s] as const));
        const merged: Song[] = [];
        const seen = new Set<string>();
        for (const song of loadedSongs) {
          seen.add(song.id);
          const existing = prevById.get(song.id);
          if (existing && song.isGenerating) {
            merged.push({
              ...song,
              progress: existing.progress ?? song.progress,
              stage: existing.stage ?? (song as Song).stage,
              queuePosition: existing.queuePosition ?? song.queuePosition,
            });
          } else {
            merged.push(song);
          }
        }
        // Re-add any in-flight songs the backend hasn't surfaced yet — covers
        // the ~50-500 ms race between handleGenerate's setSongs and the first
        // refreshSongsList completing.
        for (const s of prev) {
          if (s.isGenerating && !seen.has(s.id)) merged.push(s);
        }
        return merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });

      // If the current selection was a temp/generating song, replace it with newest real song
      const current = selectedSongRef.current;
      if (current?.isGenerating || (current && !loadedSongs.some(s => s.id === current.id))) {
        setSelectedSong(loadedSongs[0] ?? null);
      }
    } catch (error) {
      console.error('Failed to refresh songs:', error);
    }
  }, [token]);

  // Belt-and-braces: while any generation is in flight, periodically
  // refresh the songs list so the workspace shows newly-completed tracks
  // (and their real covers) even when the per-job success callback misses
  // — e.g. background tab throttling, network blip, or a job whose ws
  // progress arrived but whose "succeeded" event we dropped. Placed AFTER
  // refreshSongsList's declaration so it doesn't hit the temporal-dead-zone
  // ReferenceError that bricked production for ~5 minutes (commit 40893d1).
  useEffect(() => {
    if (!isGenerating || !token) return;
    const id = setInterval(() => { refreshSongsList(); }, 10_000);
    return () => clearInterval(id);
  }, [isGenerating, token, refreshSongsList]);

  // AudioMass tab posts back when the user clicks Save / Save As — pull a
  // fresh song list so the player picks up the new audio URL.
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const data: any = ev.data;
      if (!data || data.type !== 'myuzika:audiomass-saved') return;
      refreshSongsList();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [refreshSongsList]);

  // openAudioEditor (services/editor.ts) dispatches 'myuzika:toast' events
  // while it runs Demucs in the background — surface them on the shared
  // Toast so the user sees "Extracting stems…" / "Stems ready" instead of
  // a silent 30-60 s hang.
  useEffect(() => {
    const onToast = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {};
      if (typeof detail.message === 'string') {
        showToast(detail.message, (detail.type as ToastType) || 'info');
      }
    };
    window.addEventListener('myuzika:toast', onToast);
    return () => window.removeEventListener('myuzika:toast', onToast);
  }, []);

  const beginPollingJob = useCallback((jobId: string, tempId: string) => {
    if (!token) return;
    if (activeJobsRef.current.has(jobId)) return;

    // Track consecutive poll failures so a single network blip doesn't
    // immediately drop the temp song from the UI.
    let consecutiveErrors = 0;
    const pollInterval = setInterval(async () => {
      try {
        const status = await generateApi.getStatus(jobId, token);
        consecutiveErrors = 0;
        // status.progress is t.progress?.percent — a NUMBER (0-100) or
        // null/undefined. Treat null/undefined as "no progress yet" and
        // KEEP the previous value. Number(null) is 0 (subtle), so we
        // must guard with == null explicitly.
        const rawProgress = status.progress;
        const normalizedProgress = (rawProgress == null)
          ? undefined
          : (Number.isFinite(Number(rawProgress))
              ? (Number(rawProgress) > 1 ? Number(rawProgress) / 100 : Number(rawProgress))
              : undefined);

        setSongs(prev => {
          const song = prev.find(s => s.id === tempId);
          if (!song) return prev;
          const newQueuePos = status.status === 'queued' ? status.queuePosition : undefined;
          const newProgress = normalizedProgress ?? song.progress;
          const newStage = status.stage ?? song.stage;
          // Skip update if nothing changed to avoid unnecessary re-renders
          if (newProgress === song.progress && newStage === song.stage && newQueuePos === song.queuePosition) {
            return prev;
          }
          return prev.map(s => {
            if (s.id !== tempId) return s;
            return { ...s, queuePosition: newQueuePos, progress: newProgress, stage: newStage };
          });
        });

        // Trigger cleanup + refresh as soon as the backend reports done,
        // even if `result` (audioUrl) isn't materialised yet — that field
        // can lag by 1-2s between status='done' and refreshTrack writing
        // the filename row. If we wait for it, the temp song stays in
        // limbo and the workspace doesn't update. The next refresh tick
        // (per-job + the 10s safety net) brings the real audioUrl in.
        if (status.status === 'succeeded') {
          cleanupJob(jobId, tempId);
          await refreshSongsList();

          if (window.innerWidth < 768) {
            setMobileShowList(true);
          }
        } else if (status.status === 'failed') {
          cleanupJob(jobId, tempId);
          console.error(`Job ${jobId} failed:`, status.error);
          showToast(`${t('generationFailed')}: ${status.error || 'Unknown error'}`, 'error');
        }
      } catch (pollError) {
        consecutiveErrors += 1;
        console.warn(`Polling error for job ${jobId} (${consecutiveErrors}):`, pollError);
        // Only nuke the temp after several consecutive failures — a
        // single network blip used to drop the temp song instantly.
        if (consecutiveErrors >= 5) {
          console.error(`Job ${jobId} failed after ${consecutiveErrors} poll errors`);
          cleanupJob(jobId, tempId);
        }
      }
    }, 2000);

    activeJobsRef.current.set(jobId, { tempId, pollInterval });
    setActiveJobCount(activeJobsRef.current.size);

    setTimeout(() => {
      if (activeJobsRef.current.has(jobId)) {
        console.warn(`Job ${jobId} timed out`);
        cleanupJob(jobId, tempId);
        showToast(t('generationTimedOut'), 'error');
      }
    }, 600000);
  }, [token, cleanupJob, refreshSongsList]);

  const buildTempSongFromParams = (params: GenerationParams, tempId: string, createdAt?: string) => ({
    id: tempId,
    title: params.title || 'Generating...',
    lyrics: '',
    style: params.style || params.songDescription || '',
    coverUrl: 'https://picsum.photos/200/200?blur=10',
    duration: '--:--',
    createdAt: createdAt ? new Date(createdAt) : new Date(),
    isGenerating: true,
    tags: params.customMode ? ['custom'] : ['simple'],
    isPublic: true,
  });

  // Handlers
  const handleGenerate = async (params: GenerationParams) => {
    if (!isAuthenticated || !token) {
      setShowUsernameModal(true);
      return;
    }

    setIsGenerating(true);
    setCurrentView('create');
    setMobileShowList(false);

    // No optimistic "temp_xxx" row anymore. The backend inserts a track row
    // with status='queued' on the POST itself, and toFspeciiSong now marks
    // that row as `isGenerating: true` (api.ts). After the POST returns we
    // pull it in via refreshSongsList — single source of truth, no duplicate
    // "Generating…" + "Creating…" rows for the same logical job. Latency
    // before the user sees a row is ~200-500 ms (the POST round-trip).
    setShowRightSidebar(true);

    try {
      const job = await generateApi.startGeneration({
        customMode: params.customMode,
        songDescription: params.songDescription,
        lyrics: params.lyrics,
        style: params.style,
        title: params.title,
        instrumental: params.instrumental,
        vocalLanguage: params.vocalLanguage,
        duration: params.duration && params.duration > 0 ? params.duration : undefined,
        bpm: params.bpm,
        keyScale: params.keyScale,
        timeSignature: params.timeSignature,
        inferenceSteps: params.inferenceSteps,
        guidanceScale: params.guidanceScale,
        batchSize: params.batchSize,
        randomSeed: params.randomSeed,
        seed: params.seed,
        thinking: params.thinking,
        audioFormat: params.audioFormat,
        mp3Quality: params.mp3Quality,
        inferMethod: params.inferMethod,
        shift: params.shift,
        lmTemperature: params.lmTemperature,
        lmCfgScale: params.lmCfgScale,
        lmTopK: params.lmTopK,
        lmTopP: params.lmTopP,
        lmNegativePrompt: params.lmNegativePrompt,
        lmBackend: params.lmBackend,
        lmModel: params.lmModel,
        referenceAudioUrl: params.referenceAudioUrl,
        sourceAudioUrl: params.sourceAudioUrl,
        referenceAudioTitle: params.referenceAudioTitle,
        sourceAudioTitle: params.sourceAudioTitle,
        audioCodes: params.audioCodes,
        repaintingStart: params.repaintingStart,
        repaintingEnd: params.repaintingEnd,
        instruction: params.instruction,
        audioCoverStrength: params.audioCoverStrength,
        taskType: params.taskType,
        useAdg: params.useAdg,
        cfgIntervalStart: params.cfgIntervalStart,
        cfgIntervalEnd: params.cfgIntervalEnd,
        customTimesteps: params.customTimesteps,
        useCotMetas: params.useCotMetas,
        useCotCaption: params.useCotCaption,
        useCotLanguage: params.useCotLanguage,
        autogen: params.autogen,
        constrainedDecodingDebug: params.constrainedDecodingDebug,
        allowLmBatch: params.allowLmBatch,
        getScores: params.getScores,
        getLrc: params.getLrc,
        scoreScale: params.scoreScale,
        lmBatchChunkSize: params.lmBatchChunkSize,
        trackName: params.trackName,
        completeTrackClasses: params.completeTrackClasses,
        isFormatCaption: params.isFormatCaption,
      }, token);

      // job.jobId is String(trackId) — the real backend row id. Pull it in
      // and poll status onto that row. No temp, no duplicates.
      const realId = String(job.jobId);
      await refreshSongsList();
      beginPollingJob(job.jobId, realId);

    } catch (e) {
      console.error('Generation error:', e);

      // Only set isGenerating to false if no other jobs are running
      if (activeJobsRef.current.size === 0) {
        setIsGenerating(false);
      }
      showToast(t('generationFailed'), 'error');
    }
  };

  // Resume active jobs on refresh so progress keeps updating. We no longer
  // insert `job_<jobId>` temp rows here — the backend's getMySongs already
  // returns in-flight tracks as `isGenerating: true` (via toFspeciiSong),
  // so all we need to do is restart polling for each one so progress %
  // keeps ticking instead of freezing at "Creating…" until the row
  // completes.
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    (async () => {
      try {
        const history = await generateApi.getHistory(token);
        const jobs = Array.isArray(history.jobs) ? history.jobs : [];
        const active = new Set(['pending', 'queued', 'running']);
        for (const job of jobs as any[]) {
          if (!active.has(job.status)) continue;
          const jobId = job.id || job.jobId;
          if (!jobId) continue;
          beginPollingJob(String(jobId), String(jobId));
        }
      } catch (error) {
        console.error('Failed to resume jobs:', error);
      }
    })();
  }, [isAuthenticated, token, beginPollingJob]);

  const togglePlay = () => {
    if (!currentSong) return;
    if (!currentSong.audioUrl) {
      showToast(t('songNotAvailable'), 'error');
      return;
    }
    setIsPlaying(!isPlaying);
  };

  const playFirst = () => {
    const available = songs.filter(s => s.audioUrl && !s.isGenerating);
    if (available.length > 0) {
      playSong(available[0], available);
    }
  };

  const playSong = (song: Song, list?: Song[]) => {
    const nextQueue = list && list.length > 0
      ? list
      : (playQueue.length > 0 && playQueue.some(s => s.id === song.id))
          ? playQueue
          : (songs.some(s => s.id === song.id) ? songs : [song]);
    const nextIndex = nextQueue.findIndex(s => s.id === song.id);
    setPlayQueue(nextQueue);
    setQueueIndex(nextIndex);

    if (currentSong?.id !== song.id) {
      const updatedSong = { ...song, viewCount: (song.viewCount || 0) + 1 };
      setCurrentSong(updatedSong);
      setSelectedSong(updatedSong);
      setIsPlaying(true);
      setSongs(prev => prev.map(s => s.id === song.id ? updatedSong : s));
      songsApi.trackPlay(song.id, token).catch(err => console.error('Failed to track play:', err));
    } else {
      togglePlay();
    }
    if (currentSong?.id === song.id) {
      setSelectedSong(song);
    }
    setShowRightSidebar(true);
  };

  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (Number.isNaN(audio.duration) || audio.readyState < 1 || audio.seekable.length === 0) {
      pendingSeekRef.current = time;
      return;
    }
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const toggleLike = async (songId: string) => {
    if (!token) return;

    const isLiked = likedSongIds.has(songId);

    // Optimistic update
    setLikedSongIds(prev => {
      const next = new Set(prev);
      if (isLiked) next.delete(songId);
      else next.add(songId);
      return next;
    });

    setSongs(prev => prev.map(s => {
      if (s.id === songId) {
        const newCount = (s.likeCount || 0) + (isLiked ? -1 : 1);
        return { ...s, likeCount: Math.max(0, newCount) };
      }
      return s;
    }));

    if (selectedSong?.id === songId) {
      setSelectedSong(prev => prev ? {
        ...prev,
        likeCount: Math.max(0, (prev.likeCount || 0) + (isLiked ? -1 : 1))
      } : null);
    }

    // Persist to database
    try {
      await songsApi.toggleLike(songId, token);
    } catch (error) {
      console.error('Failed to toggle like:', error);
      // Revert on error
      setLikedSongIds(prev => {
        const next = new Set(prev);
        if (isLiked) next.add(songId);
        else next.delete(songId);
        return next;
      });
    }
  };

  const handleDeleteSong = (song: Song) => {
    handleDeleteSongs([song]);
  };

  const handleDeleteSongs = (songsToDelete: Song[]) => {
    if (!token || songsToDelete.length === 0) return;

    const isSingle = songsToDelete.length === 1;
    const title = isSingle ? t('confirmDeleteTitle') : t('confirmDeleteManyTitle');
    const message = isSingle
      ? t('deleteSongConfirm').replace('{title}', songsToDelete[0].title)
      : t('deleteSongsConfirm').replace('{count}', String(songsToDelete.length));

    setConfirmDialog({
      title,
      message,
      onConfirm: async () => {
        setConfirmDialog(null);

        const idsToDelete = new Set(songsToDelete.map(song => song.id));
        const succeeded: string[] = [];
        const failed: string[] = [];

        for (const song of songsToDelete) {
          try {
            await songsApi.deleteSong(song.id, token!);
            succeeded.push(song.id);
          } catch (error) {
            console.error('Failed to delete song:', error);
            failed.push(song.id);
          }
        }

        if (succeeded.length > 0) {
          setSongs(prev => prev.filter(s => !idsToDelete.has(s.id) || failed.includes(s.id)));

          setLikedSongIds(prev => {
            const next = new Set(prev);
            succeeded.forEach(id => next.delete(id));
            return next;
          });

          if (selectedSong?.id && succeeded.includes(selectedSong.id)) {
            setSelectedSong(null);
          }

          if (currentSong?.id && succeeded.includes(currentSong.id)) {
            setCurrentSong(null);
            setIsPlaying(false);
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.src = '';
            }
          }

          setPlayQueue(prev => prev.filter(s => !idsToDelete.has(s.id) || failed.includes(s.id)));
        }

        if (failed.length > 0) {
          showToast(t('songsDeletedPartial').replace('{succeeded}', String(succeeded.length)).replace('{total}', String(songsToDelete.length)), 'error');
        } else if (isSingle) {
          showToast(t('songDeleted'));
        } else {
          showToast(t('songsDeletedSuccess'));
        }
      },
    });
  };

  const handleDeleteReferenceTrack = (trackId: string) => {
    if (!token) return;

    setConfirmDialog({
      title: t('delete'),
      message: t('deleteUploadConfirm'),
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const response = await fetch(`${API_BASE}/api/reference-tracks/${trackId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token!}` }
          });
          if (!response.ok) {
            throw new Error('Failed to delete upload');
          }
          setReferenceTracks(prev => prev.filter(track => track.id !== trackId));
          showToast(t('songDeleted'));
        } catch (error) {
          console.error('Failed to delete upload:', error);
          showToast(t('failedToDeleteSong'), 'error');
        }
      },
    });
  };

  const createPlaylist = async (name: string, description: string) => {
    if (!token) return;
    try {
      const res = await playlistsApi.create(name, description, true, token);
      setPlaylists(prev => [res.playlist, ...prev]);

      if (songToAddToPlaylist) {
        await playlistsApi.addSong(res.playlist.id, songToAddToPlaylist.id, token);
        setSongToAddToPlaylist(null);
        playlistsApi.getMyPlaylists(token).then(r => setPlaylists(r.playlists)).catch(() => {});
      }
      showToast(t('playlistCreated'));
    } catch (error) {
      console.error('Create playlist error:', error);
      showToast(t('failedToCreatePlaylist'), 'error');
    }
  };

  const openAddToPlaylistModal = (song: Song) => {
    setSongToAddToPlaylist(song);
    setIsAddToPlaylistModalOpen(true);
  };

  const addSongToPlaylist = async (playlistId: string) => {
    if (!songToAddToPlaylist || !token) return;
    try {
      await playlistsApi.addSong(playlistId, songToAddToPlaylist.id, token);
      setSongToAddToPlaylist(null);
      showToast(t('songAddedToPlaylist'));
      playlistsApi.getMyPlaylists(token).then(r => setPlaylists(r.playlists)).catch(() => {});
    } catch (error) {
      console.error('Add song error:', error);
      showToast(t('failedToAddSong'), 'error');
    }
  };

  const handleNavigateToPlaylist = (playlistId: string) => {
    setViewingPlaylistId(playlistId);
    setCurrentView('playlist');
    window.history.pushState({}, '', `/playlist/${playlistId}`);
  };

  const handleUseAsReference = (song: Song) => {
    if (!song.audioUrl) return;
    setPendingAudioSelection({ target: 'reference', url: song.audioUrl, title: song.title });
    setCurrentView('create');
    setMobileShowList(false);
  };

  const handleCoverSong = (song: Song) => {
    if (!song.audioUrl) return;
    setPendingAudioSelection({ target: 'source', url: song.audioUrl, title: song.title });
    setCurrentView('create');
    setMobileShowList(false);
  };

  // "Edit Audio" — repurposed from the legacy /editor route (which never
  // existed) to drop the user into the Create panel pre-loaded for an
  // Edit-task generation: same melody, new lyrics. CreatePanel picks up
  // the `target: 'edit'` pendingAudioSelection and flips Custom mode +
  // taskType='edit' for them.
  const handleEditAudio = (song: Song) => {
    if (!song.audioUrl) return;
    setPendingAudioSelection({ target: 'edit', url: song.audioUrl, title: song.title });
    setCurrentView('create');
    setMobileShowList(false);
  };

  const handleUseUploadAsReference = (track: { audio_url: string; filename: string }) => {
    setPendingAudioSelection({
      target: 'reference',
      url: track.audio_url,
      title: track.filename.replace(/\.[^/.]+$/, ''),
    });
    setCurrentView('create');
    setMobileShowList(false);
  };

  const handleCoverUpload = (track: { audio_url: string; filename: string }) => {
    setPendingAudioSelection({
      target: 'source',
      url: track.audio_url,
      title: track.filename.replace(/\.[^/.]+$/, ''),
    });
    setCurrentView('create');
    setMobileShowList(false);
  };

  const handleBackFromPlaylist = () => {
    setViewingPlaylistId(null);
    setCurrentView('library');
    window.history.pushState({}, '', '/library');
  };

  const openVideoGenerator = (song: Song) => {
    if (isPlaying) {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    }
    setSongForVideo(song);
    setIsVideoModalOpen(true);
  };

  // Listen for `myuzika:edit-audio` events dispatched by the song-row
  // dropdown menus (SongDropdownMenu's handleEditAudio fallback). Routes
  // to the Create panel pre-loaded with task_type='edit' and this song
  // as the source. Avoids prop-drilling through 8+ dropdown callsites.
  useEffect(() => {
    const onEditAudioEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ song: Song }>).detail;
      if (detail?.song) handleEditAudio(detail.song);
    };
    window.addEventListener('myuzika:edit-audio', onEditAudioEvent as EventListener);
    return () => window.removeEventListener('myuzika:edit-audio', onEditAudioEvent as EventListener);
  }, []); // handleEditAudio is stable enough — uses setState only

  // Handle username setup
  const handleUsernameSubmit = async (username: string) => {
    await setupUser(username);
    setShowUsernameModal(false);
  };

  // Render Layout Logic
  const renderContent = () => {
    switch (currentView) {
      case 'library': {
        const allSongs = user ? songs.filter(s => s.userId === user.id) : [];
        return (
          <LibraryView
            allSongs={allSongs}
            likedSongs={songs.filter(s => likedSongIds.has(s.id))}
            playlists={playlists}
            referenceTracks={referenceTracks}
            onPlaySong={playSong}
            onCreatePlaylist={() => {
              setSongToAddToPlaylist(null);
              setIsCreatePlaylistModalOpen(true);
            }}
            onSelectPlaylist={(p) => handleNavigateToPlaylist(p.id)}
            onAddToPlaylist={openAddToPlaylistModal}
            onOpenVideo={openVideoGenerator}
            onReusePrompt={handleReuse}
            onDeleteSong={handleDeleteSong}
            onDeleteReferenceTrack={handleDeleteReferenceTrack}
          />
        );
      }

      case 'profile':
        if (!viewingUsername) return null;
        return (
          <UserProfile
            username={viewingUsername}
            onBack={handleBackFromProfile}
            onPlaySong={playSong}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToPlaylist={handleNavigateToPlaylist}
            currentSong={currentSong}
            isPlaying={isPlaying}
            likedSongIds={likedSongIds}
            onToggleLike={toggleLike}
          />
        );

      case 'playlist':
        if (!viewingPlaylistId) return null;
        return (
          <PlaylistDetail
            playlistId={viewingPlaylistId}
            onBack={handleBackFromPlaylist}
            onPlaySong={playSong}
            onSelect={(s) => {
              setSelectedSong(s);
              setShowRightSidebar(true);
            }}
            onNavigateToProfile={handleNavigateToProfile}
          />
        );

      case 'song':
        if (!viewingSongId) return null;
        return (
          <SongProfile
            songId={viewingSongId}
            onBack={handleBackFromSong}
            onPlay={playSong}
            onNavigateToProfile={handleNavigateToProfile}
            currentSong={currentSong}
            isPlaying={isPlaying}
            likedSongIds={likedSongIds}
            onToggleLike={toggleLike}
          />
        );

      case 'search':
        return (
          <SearchPage
            onPlaySong={playSong}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToSong={handleNavigateToSong}
            onNavigateToPlaylist={handleNavigateToPlaylist}
          />
        );

      case 'training':
        return <TrainingPanel />;

      case 'musicvideo':
        return <MusicVideoPanel songs={songs} token={token} />;

      case 'news':
        return <NewsPage />;

      case 'create':
      default:
        return (
          <div className="flex h-full overflow-hidden relative w-full min-w-0">
            {/* Create Panel */}
            <div
              className={`
                ${mobileShowList ? 'hidden md:block' : 'w-full'}
                flex-shrink-0 h-full bg-zinc-50 dark:bg-suno-panel relative z-10 transition-colors duration-300
              `}
              style={isDesktop ? { width: createPanelWidth } : undefined}
            >
              <CreatePanel
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                initialData={reuseData}
                createdSongs={songs}
                pendingAudioSelection={pendingAudioSelection}
                onAudioSelectionApplied={() => setPendingAudioSelection(null)}
              />
            </div>

            {/* Vertical drag handle (desktop only). Sits flush between the
                CreatePanel and SongList; hover/active styling makes the hit
                area easy to grab without taking visual space at rest. */}
            {isDesktop && (
              <div
                onMouseDown={onCreatePanelDragStart}
                className="hidden md:flex group items-stretch w-1.5 cursor-col-resize relative z-20 select-none"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize create panel"
                title="Drag to resize"
              >
                <div className="flex-1 bg-zinc-200 dark:bg-white/5 group-hover:bg-pink-500/60 group-active:bg-pink-500/80 transition-colors" />
              </div>
            )}

            {/* Song List — min-w-0 lets the flex item shrink below the
                intrinsic width of its content (Safari needs this on flex-1
                children or the layout overflows). */}
            <div className={`
              ${!mobileShowList ? 'hidden md:flex' : 'flex'}
              flex-1 min-w-0 flex-col h-full overflow-hidden bg-white dark:bg-suno-DEFAULT transition-colors duration-300
            `}>
              <SongList
                songs={songs}
                currentSong={currentSong}
                selectedSong={selectedSong}
                likedSongIds={likedSongIds}
                isPlaying={isPlaying}
                referenceTracks={referenceTracks}
                onPlay={playSong}
                onSelect={(s) => {
                  setSelectedSong(s);
                  setShowRightSidebar(true);
                }}
                onToggleLike={toggleLike}
                onAddToPlaylist={openAddToPlaylistModal}
                onOpenVideo={openVideoGenerator}
                onShowDetails={handleShowDetails}
                onNavigateToProfile={handleNavigateToProfile}
                onReusePrompt={handleReuse}
                onDelete={handleDeleteSong}
                onDeleteMany={handleDeleteSongs}
                onUseAsReference={handleUseAsReference}
                onCoverSong={handleCoverSong}
                onUseUploadAsReference={handleUseUploadAsReference}
                onCoverUpload={handleCoverUpload}
                onSongUpdate={handleSongUpdate}
              />
            </div>

            {/* Right Sidebar */}
            {showRightSidebar && (
              <div className="hidden xl:block w-[360px] flex-shrink-0 h-full bg-zinc-50 dark:bg-suno-panel relative z-10 border-l border-zinc-200 dark:border-white/5 transition-colors duration-300">
                <RightSidebar
                  song={selectedSong}
                  onClose={() => setShowRightSidebar(false)}
                  onOpenVideo={() => selectedSong && openVideoGenerator(selectedSong)}
                  onReuse={handleReuse}
                  onSongUpdate={handleSongUpdate}
                  onNavigateToProfile={handleNavigateToProfile}
                  onNavigateToSong={handleNavigateToSong}
                  isLiked={selectedSong ? likedSongIds.has(selectedSong.id) : false}
                  onToggleLike={toggleLike}
                  onDelete={handleDeleteSong}
                  onPlay={playSong}
                  isPlaying={isPlaying}
                  currentSong={currentSong}
                />
              </div>
            )}

            {/* Mobile Toggle Button */}
            <div className="md:hidden absolute top-4 right-4 z-50">
              <button
                onClick={() => setMobileShowList(!mobileShowList)}
                className="bg-zinc-800 text-white px-4 py-2 rounded-full shadow-lg border border-white/10 flex items-center gap-2 text-sm font-bold"
              >
                {mobileShowList ? t('createSong') : t('viewList')}
                <List size={16} />
              </button>
            </div>
          </div>
        );
    }
  };

  // Marketing landing is parked at /welcome while we iterate on it. Anyone
  // visiting that path (signed in or not) sees the landing. Sign-in CTAs
  // open the existing UsernameModal in-page.
  if (typeof window !== 'undefined' && window.location.pathname === '/welcome') {
    return (
      <>
        <LandingPage onSignInClick={() => setShowUsernameModal(true)} />
        <UsernameModal
          isOpen={showUsernameModal}
          onClose={() => setShowUsernameModal(false)}
          onSubmit={async () => { setShowUsernameModal(false); }}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-suno-DEFAULT text-zinc-900 dark:text-white font-sans antialiased selection:bg-pink-500/30 transition-colors duration-300">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentView={currentView}
          onNavigate={(v) => {
            setCurrentView(v);
            if (v === 'create') {
              setMobileShowList(false);
              window.history.pushState({}, '', '/');
            } else if (v === 'library') {
              window.history.pushState({}, '', '/library');
            } else if (v === 'search') {
              window.history.pushState({}, '', '/search');
            } else if (v === 'news') {
              window.history.pushState({}, '', '/news');
            }
            if (isMobile) setShowLeftSidebar(false);
          }}
          theme={theme}
          onToggleTheme={toggleTheme}
          user={user}
          onLogin={() => setShowUsernameModal(true)}
          onLogout={logout}
          onOpenSettings={() => setShowSettingsModal(true)}
          isOpen={showLeftSidebar}
          onToggle={() => setShowLeftSidebar(!showLeftSidebar)}
        />

        {/* min-w-0 is the Safari fix — without it, flex children with content
            (long song titles / descriptions in SongList rows) refuse to
            shrink below their intrinsic width, pushing the whole layout
            past the viewport edge. Chrome is more permissive; Safari isn't.
            overflow-x-hidden is a belt-and-braces fallback in case anything
            nested still produces stray horizontal scroll. */}
        <main className="flex-1 min-w-0 flex overflow-hidden overflow-x-hidden relative">
          {renderContent()}
        </main>
      </div>

      <Player
        currentSong={currentSong}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        currentTime={currentTime}
        duration={duration}
        onSeek={handleSeek}
        onNext={playNext}
        onPrevious={playPrevious}
        volume={volume}
        onVolumeChange={setVolume}
        playbackRate={playbackRate}
        onPlaybackRateChange={setPlaybackRate}
        audioRef={audioRef}
        isShuffle={isShuffle}
        onToggleShuffle={() => setIsShuffle(!isShuffle)}
        repeatMode={repeatMode}
        onToggleRepeat={() => setRepeatMode(prev => prev === 'none' ? 'all' : prev === 'all' ? 'one' : 'none')}
        isLiked={currentSong ? likedSongIds.has(currentSong.id) : false}
        onToggleLike={() => currentSong && toggleLike(currentSong.id)}
        onNavigateToSong={handleNavigateToSong}
        onOpenVideo={() => currentSong && openVideoGenerator(currentSong)}
        onReusePrompt={() => currentSong && handleReuse(currentSong)}
        onAddToPlaylist={() => currentSong && openAddToPlaylistModal(currentSong)}
        onDelete={() => currentSong && handleDeleteSong(currentSong)}
        onPlayFirst={playFirst}
      />

      <CreatePlaylistModal
        isOpen={isCreatePlaylistModalOpen}
        onClose={() => setIsCreatePlaylistModalOpen(false)}
        onCreate={createPlaylist}
      />
      <AddToPlaylistModal
        isOpen={isAddToPlaylistModalOpen}
        onClose={() => setIsAddToPlaylistModalOpen(false)}
        playlists={playlists}
        onSelect={addSongToPlaylist}
        onCreateNew={() => {
          setIsAddToPlaylistModalOpen(false);
          setIsCreatePlaylistModalOpen(true);
        }}
      />
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={closeToast}
      />
      <VideoGeneratorModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        song={songForVideo}
      />
      <UsernameModal
        isOpen={showUsernameModal}
        onClose={() => setShowUsernameModal(false)}
        onSubmit={handleUsernameSubmit}
      />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigateToProfile={handleNavigateToProfile}
      />

      {/* Mobile Details Modal */}
      {showMobileDetails && selectedSong && (
        <div className="fixed inset-0 z-[60] flex justify-end xl:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in"
            onClick={() => setShowMobileDetails(false)}
          />
          <div className="relative w-full max-w-md h-full bg-zinc-50 dark:bg-suno-panel shadow-2xl animate-in slide-in-from-right duration-300 border-l border-white/10">
            <RightSidebar
              song={selectedSong}
              onClose={() => setShowMobileDetails(false)}
              onOpenVideo={() => selectedSong && openVideoGenerator(selectedSong)}
              onReuse={handleReuse}
              onSongUpdate={handleSongUpdate}
              onNavigateToProfile={handleNavigateToProfile}
              onNavigateToSong={handleNavigateToSong}
              isLiked={selectedSong ? likedSongIds.has(selectedSong.id) : false}
              onToggleLike={toggleLike}
              onDelete={handleDeleteSong}
              onPlay={playSong}
              isPlaying={isPlaying}
              currentSong={currentSong}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog !== null}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
