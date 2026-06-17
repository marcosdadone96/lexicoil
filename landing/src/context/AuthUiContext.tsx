'use client';

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { AuthModal, AuthMode } from '@/components/ui/AuthModal';

type AuthUiContextValue = {
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
};

const AuthUiContext = createContext<AuthUiContextValue | null>(null);

export function AuthUiProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');

  const openAuth = useCallback((m: AuthMode = 'login') => {
    setMode(m);
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ openAuth, closeAuth }), [openAuth, closeAuth]);

  return (
    <AuthUiContext.Provider value={value}>
      {children}
      <AuthModal isOpen={open} onClose={closeAuth} initialMode={mode} />
    </AuthUiContext.Provider>
  );
}

export function useAuthUi() {
  const ctx = useContext(AuthUiContext);
  if (!ctx) throw new Error('useAuthUi must be used within AuthUiProvider');
  return ctx;
}
