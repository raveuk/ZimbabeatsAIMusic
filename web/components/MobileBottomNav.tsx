// Mobile bottom tab bar — replaces the side menu on phones. Follows the
// Suno / Spotify / TikTok pattern: 5 destinations, centre item highlighted as
// the primary action (Create), bottom-safe-area aware so it doesn't sit under
// the home-indicator on iOS.
//
// Only renders when isMobile is true (App.tsx gates it). The Sidebar stays
// the source of truth on desktop.
import React from 'react';
import { Disc, Library, Search, Film, User } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

type View =
  | 'create' | 'library' | 'search' | 'training'
  | 'musicvideo' | 'news' | 'profile';

interface MobileBottomNavProps {
  currentView: View;
  onNavigate: (view: View) => void;
  username?: string;
  avatarUrl?: string;
  hasPlayer?: boolean;  // when the global Player is visible, lift the nav above it
}

interface TabSpec {
  view: View;
  label: string;
  icon: React.ReactNode;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView, onNavigate, username, avatarUrl, hasPlayer,
}) => {
  const { t } = useI18n();

  const tabs: TabSpec[] = [
    { view: 'library',    label: t('library'),   icon: <Library size={22} /> },
    { view: 'search',     label: t('search'),    icon: <Search size={22} /> },
    { view: 'create',     label: t('create'),    icon: <Disc size={26} /> },     // centre / primary
    { view: 'musicvideo', label: 'Video',        icon: <Film size={22} /> },
    { view: 'profile',    label: 'Profile',      icon: <User size={22} /> },
  ];

  return (
    <nav
      className={`
        flex-shrink-0 z-40
        md:hidden
        bg-white dark:bg-zinc-950
        border-t border-zinc-200 dark:border-white/10
        pb-[env(safe-area-inset-bottom)]
      `}
      aria-label="Primary"
    >
      <div className="grid grid-cols-5 h-14">
        {tabs.map((tab) => {
          const isActive = currentView === tab.view;
          const isPrimary = tab.view === 'create';

          // Profile gets a real avatar instead of the generic icon when
          // we have one.
          const iconNode =
            tab.view === 'profile' && (avatarUrl || username) ? (
              <div className={`w-7 h-7 rounded-full overflow-hidden ${isActive ? 'ring-2 ring-pink-500' : ''}`}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt={username || 'me'} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-pink-500 to-purple-600 text-white text-xs font-bold flex items-center justify-center">
                    {(username || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            ) : tab.icon;

          return (
            <button
              key={tab.view}
              onClick={() => onNavigate(tab.view)}
              className={`
                relative flex flex-col items-center justify-center gap-0.5
                transition-colors
                ${isActive
                  ? (isPrimary
                      ? 'text-pink-500'
                      : 'text-zinc-900 dark:text-white')
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}
              `}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
            >
              {isPrimary ? (
                <div
                  className={`
                    flex items-center justify-center w-11 h-11 rounded-full
                    transition-all
                    ${isActive
                      ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/30 scale-105'
                      : 'bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-white'}
                  `}
                >
                  {iconNode}
                </div>
              ) : (
                <div className="flex items-center justify-center h-6">
                  {iconNode}
                </div>
              )}
              <span className={`text-[10px] font-medium leading-none ${isPrimary ? 'mt-0.5' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
