import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { authApi, User, _setCurrentUserForSongMapper, _setCurrentTokenForSongMapper } from '../services/api';
import { auth as firebaseAuth } from '../services/firebase';

// AuthContext that surfaces Firebase sign-in to the existing UI components.
// We keep the same shape the upstream UI expects (user, token,
// isAuthenticated, logout, setupUser, …) so SongList / Player /
// RightSidebar etc. work unchanged.
//
// Two flow shifts vs upstream:
//   - There's no "auto-login as the only local user" path anymore — Firebase
//     either has a session or it doesn't. isLoading flips false once we know.
//   - setupUser(username) is hijacked: we no longer accept username for
//     signup. The auth UI is replaced with an email+password modal.
//     The compatibility stub still exists so legacy modal code that calls
//     setupUser() doesn't crash.
//
// Google sign-in uses signInWithRedirect (not signInWithPopup) because our
// Cloudflare Pages headers set `Cross-Origin-Opener-Policy: same-origin` for
// FFmpeg.wasm SharedArrayBuffer support, and that severs window.opener
// between the OAuth popup and the host tab → signInWithPopup fails with
// auth/popup-closed-by-user. Redirect-based flow side-steps the popup
// entirely; getRedirectResult below picks up the credential on the next page
// load.
interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // Compatibility surface (no-ops / map to Firebase calls)
  setupUser: (username: string) => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  // New Firebase-backed actions used by our SignInModal
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isAuthenticated = !!user && !!token;

  // Single source of truth: Firebase auth state. When sign-in completes,
  // /api/me will see the token and either return the linked SQLite row or
  // create one on the fly (handled server-side in upsertFirebaseUser).
  // onIdTokenChanged fires on sign-in/sign-out AND when Firebase auto-refreshes
  // the ID token (~hourly). Subscribing here keeps the cached token used for
  // signed audio/cover URLs perpetually fresh without us having to poll.
  useEffect(() => {
    const unsub = onIdTokenChanged(firebaseAuth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setToken(null);
        _setCurrentUserForSongMapper(null);
        _setCurrentTokenForSongMapper(null);
        setIsLoading(false);
        return;
      }
      try {
        const idToken = await fbUser.getIdToken();
        setToken(idToken);
        _setCurrentTokenForSongMapper(idToken);
        const { user: backendUser } = await authApi.me();
        setUser(backendUser);
        _setCurrentUserForSongMapper(backendUser);
      } catch (err) {
        console.error('Auth bootstrap failed:', err);
        setUser(null);
        setToken(null);
        _setCurrentUserForSongMapper(null);
        _setCurrentTokenForSongMapper(null);
      } finally {
        setIsLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Drain any pending OAuth redirect result on mount. Firebase parks the
  // credential in sessionStorage during the round-trip to accounts.google.com
  // and back; getRedirectResult resolves it, then onIdTokenChanged fires with
  // the new fbUser and the rest of the auth flow runs as normal. We swallow
  // errors silently — the most common case (no pending redirect) is not a
  // real error and would scare users on every page load.
  useEffect(() => {
    getRedirectResult(firebaseAuth).catch((err) => {
      // Only surface unexpected failures; "no pending redirect" is null/undefined return
      if (err?.code && err.code !== 'auth/no-auth-event') {
        console.error('Google redirect sign-in failed:', err);
      }
    });
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    if (!firebaseAuth.currentUser) return;
    try {
      const { user: backendUser } = await authApi.me();
      setUser(backendUser);
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  }, []);

  const logout = useCallback((): void => {
    signOut(firebaseAuth).catch(() => {});
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<void> => {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
    // onAuthStateChanged effect will update user + token automatically
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<void> => {
    await createUserWithEmailAndPassword(firebaseAuth, email, password);
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    // Full-page redirect to accounts.google.com. After consent Google sends
    // the browser back to this origin; getRedirectResult (above) picks up
    // the credential, then onIdTokenChanged completes the sign-in.
    await signInWithRedirect(firebaseAuth, new GoogleAuthProvider());
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<void> => {
    await sendPasswordResetEmail(firebaseAuth, email);
  }, []);

  // Legacy compatibility stubs — older code paths in the upstream UI still
  // reference these. The actual sign-in UI now lives in our SignInModal which
  // calls signIn/signUp directly.
  const setupUser = useCallback(async (_username: string): Promise<void> => {
    throw new Error('setupUser is deprecated — use signUp(email, password) instead.');
  }, []);
  const updateUsername = useCallback(async (_username: string): Promise<void> => {
    throw new Error('Update display name in Firebase profile instead.');
  }, []);

  const value: AuthContextType = {
    user, token, isLoading, isAuthenticated,
    setupUser, updateUsername, logout, refreshUser,
    signIn, signUp, signInWithGoogle, sendPasswordReset,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
