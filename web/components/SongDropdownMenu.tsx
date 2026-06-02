import React, { useEffect, useRef, useState } from 'react';
import { Song } from '../types';
import { useI18n } from '../context/I18nContext';
import { StemsModal } from './StemsModal';
import { lrcApi } from '../services/api';
import {
    Video,
    Edit3,
    Layers,
    Repeat,
    ListPlus,
    Download,
    FileText,
    Trash2,
    Share2
} from 'lucide-react';

interface SongDropdownMenuProps {
    song: Song;
    isOpen: boolean;
    onClose: () => void;
    isOwner?: boolean;
    position?: 'left' | 'right';
    direction?: 'up' | 'down';
    onCreateVideo?: () => void;
    onEditAudio?: () => void;
    onExtractStems?: () => void;
    onReusePrompt?: () => void;
    onAddToPlaylist?: () => void;
    onDownload?: () => void;
    onShare?: () => void;
    onDelete?: () => void;
    onUseAsReference?: () => void;
    onCoverSong?: () => void;
}

interface MenuItemProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    danger?: boolean;
    disabled?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, onClick, danger, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full px-3 py-2 text-left text-sm flex items-center gap-3 transition-colors
            ${danger
                ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                : 'text-zinc-300 hover:bg-white/5 hover:text-white'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
    >
        <span className="w-4 h-4 flex items-center justify-center opacity-70">{icon}</span>
        <span>{label}</span>
    </button>
);

const MenuDivider: React.FC = () => (
    <div className="h-px bg-white/10 my-1 mx-2" />
);

export const SongDropdownMenu: React.FC<SongDropdownMenuProps> = ({
    song,
    isOpen,
    onClose,
    isOwner = false,
    position = 'right',
    direction = 'down',
    onCreateVideo,
    onEditAudio,
    onExtractStems,
    onReusePrompt,
    onAddToPlaylist,
    onDownload,
    onShare,
    onDelete,
    onUseAsReference,
    onCoverSong
}) => {
    const { t } = useI18n();
    const menuRef = useRef<HTMLDivElement>(null);
    const [stemsOpen, setStemsOpen] = useState(false);
    const [lrcBusy, setLrcBusy] = useState(false);

    // Download karaoke .lrc — first call kicks off Granite ASR on the server
    // (~5–15s once warm; first call after a server restart pays the model
    // download cost). Subsequent calls stream from the cached file.
    const handleDownloadLrc = async () => {
        if (lrcBusy) return;
        setLrcBusy(true);
        try {
            const { blob, filename } = await lrcApi.download(song.id);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename; a.click();
            URL.revokeObjectURL(url);
            onClose();
        } catch (e) {
            console.error('LRC download failed:', e);
            alert(`LRC download failed: ${(e as Error).message}`);
        } finally {
            setLrcBusy(false);
        }
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    // Stems modal can outlive the dropdown — keep rendering when stemsOpen
    // even after isOpen has flipped to false.
    if (!isOpen && !stemsOpen) return null;

    const handleAction = (action?: () => void) => {
        if (action) {
            action();
        }
        onClose();
    };

    const handleEditAudio = () => {
        if (!song.audioUrl) return;
        const audioUrl = song.audioUrl.startsWith('http')
            ? song.audioUrl
            : `${window.location.origin}${song.audioUrl}`;
        window.open(`/editor?audioUrl=${encodeURIComponent(audioUrl)}`, '_blank');
        onClose();
    };

    // StemsModal open flag is at component scope below (above the early
    // return that bails when !open). The handler just flips it on; we
    // close the dropdown immediately so the modal sits cleanly on top.
    const handleExtractStems = () => {
        if (!song.id) return;
        setStemsOpen(true);
        onClose();
    };

    const handleDownload = async () => {
        if (!song.audioUrl) return;
        try {
            // Fetch as blob to handle cross-origin
            const response = await fetch(song.audioUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `${song.title || 'song'}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up blob URL
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
        }
        onClose();
    };

    const positionClasses = position === 'left' ? 'left-0' : 'right-0';
    const directionClasses = direction === 'up'
        ? 'bottom-full mb-2'
        : 'top-full mt-2';
    const animationClasses = direction === 'up'
        ? 'animate-in fade-in slide-in-from-bottom-2'
        : 'animate-in fade-in slide-in-from-top-2';

    return (
        <>
        {isOpen && (
        <div
            ref={menuRef}
            className={`absolute ${positionClasses} ${directionClasses} w-52
                bg-zinc-900 rounded-xl shadow-2xl border border-white/10 py-1.5 z-50
                ${animationClasses} duration-150`}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Creative Actions */}
            <MenuItem
                icon={<Video size={14} />}
                label={t('createVideo')}
                onClick={() => handleAction(onCreateVideo)}
            />
            {isOwner && (
                <MenuItem
                    icon={<Edit3 size={14} />}
                    label={t('editAudio')}
                    onClick={onEditAudio ? () => handleAction(onEditAudio) : handleEditAudio}
                />
            )}
            <MenuItem
                icon={<Layers size={14} />}
                label={t('extractStems')}
                onClick={onExtractStems ? () => handleAction(onExtractStems) : handleExtractStems}
            />
            {onReusePrompt && (
                <MenuItem
                    icon={<Repeat size={14} />}
                    label={t('reusePrompt')}
                    onClick={() => handleAction(onReusePrompt)}
                />
            )}
            {onUseAsReference && (
                <MenuItem
                    icon={<Layers size={14} />}
                    label={t('useAsReference')}
                    onClick={() => handleAction(onUseAsReference)}
                    disabled={!song.audioUrl}
                />
            )}
            {onCoverSong && (
                <MenuItem
                    icon={<Layers size={14} />}
                    label={t('coverSong')}
                    onClick={() => handleAction(onCoverSong)}
                    disabled={!song.audioUrl}
                />
            )}

            <MenuDivider />

            {/* Library Actions */}
            <MenuItem
                icon={<ListPlus size={14} />}
                label={t('addToPlaylist')}
                onClick={() => handleAction(onAddToPlaylist)}
            />
            <MenuItem
                icon={<Download size={14} />}
                label={t('download')}
                onClick={onDownload ? () => handleAction(onDownload) : handleDownload}
            />
            <MenuItem
                icon={<FileText size={14} />}
                label={lrcBusy ? 'Karaoke (.lrc) — generating…' : 'Karaoke (.lrc)'}
                onClick={handleDownloadLrc}
                disabled={lrcBusy}
            />
            <MenuItem
                icon={<Share2 size={14} />}
                label={t('share')}
                onClick={() => handleAction(onShare)}
            />

            {/* Owner-only Actions */}
            {isOwner && (
                <>
                    <MenuDivider />
                    <MenuItem
                        icon={<Trash2 size={14} />}
                        label={t('deleteSong')}
                        onClick={() => handleAction(onDelete)}
                        danger
                    />
                </>
            )}
        </div>
        )}

        {stemsOpen && (
            <StemsModal
                songId={String(song.id)}
                songTitle={song.title}
                onClose={() => setStemsOpen(false)}
            />
        )}
        </>
    );
};
