'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved =
      (localStorage.getItem('theme') as ThemeMode | null) ??
      (localStorage.getItem('lc_theme') as ThemeMode | null) ??
      'light';
    document.documentElement.setAttribute('data-theme', saved);
    setThemeState(saved);
    setReady(true);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    localStorage.setItem('lc_theme', next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  return { theme, setTheme, toggleTheme, ready };
}
