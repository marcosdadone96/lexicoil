'use client';

import Image from 'next/image';
import { FormEvent, useEffect, useState } from 'react';
import { APP_URL } from '@/lib/constants';
import {
  forgotPassword,
  loginWithEmail,
  registerWithEmail,
  signInWithGoogle,
} from '@/lib/landingAuth';
import { tryExamAsGuest } from '@/lib/tryExam';

export type AuthMode = 'login' | 'register' | 'forgot';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
};

export function AuthModal({ isOpen, onClose, initialMode = 'login' }: Props) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [regCert, setRegCert] = useState('de');
  const [regLevel, setRegLevel] = useState('B1');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError('');
      setMessage('');
      setPendingEmail('');
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const goPortal = () => {
    onClose();
    window.location.href = APP_URL;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'forgot') {
        await forgotPassword(email);
        setMessage('If that email exists, you will receive reset instructions shortly.');
        setLoading(false);
        return;
      }

      if (mode === 'register') {
        const result = await registerWithEmail(name, email, password, {
          lang: regCert,
          level: regLevel,
        });
        if (result.pendingConfirmation) {
          setPendingEmail(result.email);
          setMessage(`We sent a confirmation link to ${result.email}. Check your inbox and spam folder.`);
          setLoading(false);
          return;
        }
        goPortal();
        return;
      }

      await loginWithEmail(email, password);
      goPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setLoading(false);
    }
  };

  const continueGuest = () => {
    onClose();
    tryExamAsGuest();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to LexiCoil"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(15,23,42,0.55)] backdrop-blur-[14px]"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="animate-scale-in relative w-full max-w-md rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface)] p-8 shadow-[var(--shadow-card)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/assets/brand/icon.png" alt="" width={48} height={48} className="mb-3" />
          <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">LexiCoil</h2>
          <p className="mt-1 text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">
            EVERY MISTAKE BECOMES YOUR NEXT LESSON.
          </p>
        </div>

        {mode !== 'forgot' && !pendingEmail && (
          <div className="mb-5 flex rounded-xl bg-[var(--bg-elevated)] p-1">
            {(['login', 'register'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setMode(tab);
                  setError('');
                  setMessage('');
                  setPendingEmail('');
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  mode === tab
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {tab === 'login' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>
        )}

        {pendingEmail ? (
          <div className="space-y-4 text-center">
            <p className="text-sm font-semibold leading-relaxed text-[var(--text-secondary)]">
              {message}
            </p>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                setPendingEmail('');
                setMessage('');
                setMode('login');
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            {mode === 'register' && (
              <>
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
                <p className="text-xs font-semibold text-[var(--text-muted)]">
                  Your exam (Free: one certification)
                </p>
                <div className="flex gap-2">
                  <select
                    className="auth-input flex-1"
                    value={regCert}
                    onChange={(e) => setRegCert(e.target.value)}
                    aria-label="Certification"
                  >
                    <option value="de">Goethe</option>
                    <option value="en">Cambridge</option>
                    <option value="es">DELE</option>
                  </select>
                  <select
                    className="auth-input w-24 shrink-0"
                    value={regLevel}
                    onChange={(e) => setRegLevel(e.target.value)}
                    aria-label="Level"
                  >
                    <option value="B1">B1</option>
                    <option value="B2">B2</option>
                    <option value="C1">C1</option>
                  </select>
                </div>
                <p className="text-xs font-semibold text-[var(--text-muted)]">
                  5 official mock exams/month on this level. Pro unlocks all languages &amp; levels.
                </p>
              </>
            )}
            <input
              className="auth-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            {mode !== 'forgot' && (
              <input
                className="auth-input"
                type="password"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}
            {message && !pendingEmail && <p className="text-sm text-[var(--brand)]">{message}</p>}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading
                ? 'Please wait...'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : mode === 'register'
                    ? 'Create account'
                    : 'Sign in'}
            </button>
          </form>
        )}

        {!pendingEmail && mode === 'login' && (
          <button
            type="button"
            className="mt-3 w-full text-center text-sm text-[var(--text-secondary)] hover:text-[var(--brand)]"
            onClick={() => {
              setMode('forgot');
              setError('');
              setMessage('');
            }}
          >
            Forgot password?
          </button>
        )}

        {!pendingEmail && mode === 'forgot' && (
          <button
            type="button"
            className="mt-3 w-full text-center text-sm text-[var(--brand)]"
            onClick={() => setMode('login')}
          >
            Back to sign in
          </button>
        )}

        {!pendingEmail && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-[var(--text-muted)]">
              <span className="h-px flex-1 bg-[var(--border)]" />
              OR
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <button
              type="button"
              onClick={onGoogle}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-surface)] disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
                />
              </svg>
              Continue with Google
            </button>

            <button type="button" onClick={continueGuest} className="btn-secondary mt-3 w-full">
              Try 5-minute product demo
            </button>
            <p className="mt-3 text-center text-xs font-semibold text-[var(--text-muted)]">
              No account needed. Experience every capability in under 5 minutes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
