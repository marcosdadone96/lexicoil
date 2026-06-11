'use client';

import { useEffect, useState } from 'react';
import { Logo } from '@/components/ui/Logo';
import { Container } from '@/components/ui/Container';
import { useAuthUi } from '@/context/AuthUiContext';
import { useTheme } from '@/hooks/useTheme';
import { tryExamAsGuest } from '@/lib/tryExam';

const NAV = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Product', href: '#exams' },
  { label: 'Compare', href: '#compare' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { openAuth } = useAuthUi();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition ${
        scrolled
          ? 'border-[var(--border)] bg-[var(--bg-surface)]/85 backdrop-blur-md'
          : 'border-transparent bg-[var(--bg-base)]/80 backdrop-blur-sm'
      }`}
    >
      <Container className="flex h-16 items-center justify-between md:h-[72px]">
        <Logo />

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg p-2.5 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => openAuth('login')}
            className="px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Log in
          </button>
          <button type="button" onClick={tryExamAsGuest} className="btn-primary px-5 py-2.5">
            Try demo
          </button>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-[var(--text-secondary)] md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </Container>

      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-surface)] px-5 py-4 md:hidden">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block py-2.5 text-sm font-semibold text-[var(--text-primary)]"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={tryExamAsGuest} className="btn-primary w-full">
              Try demo
            </button>
            <button type="button" onClick={() => openAuth('login')} className="btn-secondary w-full">
              Log in
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
