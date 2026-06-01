import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { authApi, User, _setCurrentUserForSongMapper, _setCurrentTokenForSongMapper } from '../services/api';
import { auth as firebaseAuth } from '../services/firebase';

// AuthContext that surfaces Firebase sign-in to fspecii's existing UI.
// We keep the same shape they expect (user, token, isAuthenticated, logout,
// setupUser, …) so SongList / Player / RightSidebar etc. work unchanged.
//
// Two flow shifts vs upstream:
//   - There's no "auto-login as the only local user" path anymore — Firebase
//     either has a session or it doesn't. isLoading flips false once we know.
//   - setupUser(username) is hijacked: we no longer accept username for
//     signup. The auth UI is replaced with an email+password modal.
//     The compatibility stub still exists so legacy modal code that calls
//     setupUser() doesn't crash.
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
    await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<void> => {
    await sendPasswordResetEmail(firebaseAuth, email);
  }, []);

  // Legacy compatibility stubs — fspecii's UI still references these but the
  // sign-in UI now lives in our SignInModal which calls signIn/signUp directly.
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
