import React, { useState } from 'react';
import { Mail, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Sign-in / sign-up modal. Replaces the upstream UI's username-only flow.
// Mounted in App.tsx as <UsernameModal isOpen=… onSubmit=… />; we ignore both
// props and drive visibility off the auth context (modal is only visible when
// the user is not authenticated and auth bootstrapping has finished).
interface UsernameModalProps {
  isOpen: boolean;
  onSubmit?: (username: string) => Promise<void>;
}

export const UsernameModal: React.FC<UsernameModalProps> = (_props) => {
  const { isAuthenticated, isLoading, signIn, signUp, signInWithGoogle, sendPasswordReset } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  // Hide while auth is still bootstrapping OR once we're signed in.
  if (isLoading || isAuthenticated) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!email.trim() || !password) { setError('Email and password required.'); return; }
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else                   await signUp(email.trim(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      setError(msg.replace(/^Firebase:\s*/, ''));
    } finally { setBusy(false); }
  };

  const google = async () => {
    setError(''); setInfo(''); setBusy(true);
    try { await signInWithGoogle(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Google sign-in failed'); }
    finally { setBusy(false); }
  };

  const forgot = async () => {
    setError(''); setInfo('');
    if (!email.trim()) { setError('Type your email above first.'); return; }
    try {
      await sendPasswordReset(email.trim());
      setInfo("If that address has an account, we've sent a reset link.");
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send reset email'); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div className="relative w-full max-w-md bg-zinc-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500" />

        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-white mb-2">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-zinc-400 text-center mb-6">
            {mode === 'login' ? 'Sign in to keep creating' : 'Make AI music in seconds'}
          </p>

          <button
            type="button"
            disabled={busy}
            onClick={google}
            className="w-full py-3 mb-4 bg-white text-zinc-900 font-semibold rounded-xl hover:bg-zinc-100 disabled:opacity-50 transition-all"
          >
            Continue with Google
          </button>

          <div className="flex items-center my-5">
            <div className="flex-1 h-px bg-zinc-700" />
            <span className="px-3 text-xs uppercase tracking-widest text-zinc-500">or</span>
            <div className="flex-1 h-px bg-zinc-700" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-2">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="w-5 h-5 text-zinc-500" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                  disabled={busy}
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-2">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-zinc-500" />
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                  disabled={busy}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {info  && <p className="text-sm text-emerald-400">{info}</p>}

            <button
              type="submit"
              disabled={busy || !email.trim() || !password}
              className="w-full py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Log in' : 'Sign up')}
            </button>
          </form>

          {mode === 'login' && (
            <button
              type="button"
              onClick={forgot}
              className="block mx-auto mt-4 text-sm text-zinc-400 hover:text-pink-400 transition-colors"
            >
              Forgot password?
            </button>
          )}

          <div className="mt-6 flex items-center justify-center gap-2 text-sm">
            <span className="text-zinc-500">
              {mode === 'login' ? 'New here?' : 'Already have an account?'}
            </span>
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setInfo(''); }}
              className="text-pink-400 font-semibold hover:text-pink-300 transition-colors"
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
