'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  hasStoredSession,
  logoutSession,
  readCachedUser,
  restoreSession,
  type SessionUser,
} from '@/lib/landingAuth';

export type AuthUser = SessionUser;

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() =>
    typeof window !== 'undefined' && hasStoredSession() ? readCachedUser() : null,
  );
  const [ready, setReady] = useState(false);

  const fetchMe = useCallback(async () => {
    try {
      const restored = await restoreSession();
      setUser(restored);
      setReady(true);
      return restored;
    } catch {
      const cached = readCachedUser();
      setUser(cached);
      setReady(true);
      return cached;
    }
  }, []);

  useEffect(() => {
    fetchMe();

    // Same-tab updates when returning from app (storage events only fire across tabs).
    const onFocus = () => {
      if (hasStoredSession()) fetchMe();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchMe]);

  const saveToken = useCallback((token: string) => {
    localStorage.setItem('lc_token', token);
  }, []);

  const logout = useCallback(async () => {
    await logoutSession();
    setUser(null);
  }, []);

  return { user, ready, fetchMe, saveToken, logout, isLoggedIn: !!user };
}
