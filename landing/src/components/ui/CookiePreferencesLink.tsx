'use client';

export function CookiePreferencesLink({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const w = window as Window & { CookieConsent?: { openPreferences?: () => void } };
        w.CookieConsent?.openPreferences?.();
      }}
    >
      Cookie settings
    </button>
  );
}
