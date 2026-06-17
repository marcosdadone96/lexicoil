'use client';

import { ReactNode, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthUiProvider, useAuthUi } from '@/context/AuthUiContext';

function AuthQueryOpener({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const { openAuth } = useAuthUi();

  useEffect(() => {
    const auth = params.get('auth');
    if (auth === 'login' || auth === 'register') {
      openAuth(auth);
      const url = new URL(window.location.href);
      url.searchParams.delete('auth');
      window.history.replaceState({}, '', url.pathname + url.hash);
    }
  }, [params, openAuth]);

  return <>{children}</>;
}

export function SiteProviders({ children }: { children: ReactNode }) {
  return (
    <AuthUiProvider>
      <AuthQueryOpener>{children}</AuthQueryOpener>
    </AuthUiProvider>
  );
}
