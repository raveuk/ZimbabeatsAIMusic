// Mobile top header — replaces the brand block in the side menu on phones.
// Sticky at top so the logo / settings / sign-in are reachable without
// scrolling back up. Pairs with MobileBottomNav at the foot of the page.
import React from 'react';
import { Settings, Sparkles, LogIn } from 'lucide-react';

interface MobileHeaderProps {
  isAuthenticated: boolean;
  onOpenSettings: () => void;
  onSignInClick: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  isAuthenticated, onOpenSettings, onSignInClick,
}) => {
  return (
    <header
      className="
        sticky top-0 z-30
        md:hidden
        bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md
        border-b border-zinc-200 dark:border-white/10
        pt-[env(safe-area-inset-top)]
      "
      aria-label="App header"
    >
      <div className="h-12 px-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-white">
            Myuzika
          </span>
          <span className="ml-1 text-[9px] font-bold uppercase tracking-wider text-pink-500 bg-pink-500/10 px-1.5 py-0.5 rounded">
            Beta
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isAuthenticated ? (
            <button
              onClick={onOpenSettings}
              className="w-9 h-9 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 transition-colors"
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
          ) : (
            <button
              onClick={onSignInClick}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-semibold shadow active:scale-95 transition-transform"
            >
              <LogIn size={14} />
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default MobileHeader;
