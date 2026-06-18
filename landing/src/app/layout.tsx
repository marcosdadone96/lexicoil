import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import { Suspense } from 'react';
import { SiteProviders } from '@/components/providers/SiteProviders';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://lexicoil.com'),
  title: {
    default: 'LexiCoil — Adaptive Language Exam Preparation',
    template: '%s | LexiCoil',
  },
  description:
    'Every mistake becomes your next lesson. Practice official-style exams in German, English, Spanish and more — save vocabulary and generate personalized tests for your certification.',
  openGraph: {
    type: 'website',
    url: 'https://lexicoil.com',
    siteName: 'LexiCoil',
    title: 'LexiCoil — Adaptive Language Exam Preparation',
    description:
      'Turn exam mistakes into personalized practice. Official-style preparation for Goethe, Cambridge, DELE and other CEFR certifications.',
    images: [{ url: '/assets/brand/icon.png', width: 512, height: 512 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LexiCoil — Adaptive Language Exam Preparation',
    description:
      'Turn exam mistakes into personalized practice for official-style language exams — German, English, Spanish and more.',
    images: ['/assets/brand/icon.png'],
  },
  alternates: { canonical: 'https://lexicoil.com' },
};

const themeInit = `
(function(){
  try{
    var t=localStorage.getItem('theme')||localStorage.getItem('lc_theme')||'light';
    document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');
  }catch(e){}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <link rel="icon" href="/assets/brand/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/assets/brand/icon.png" />
        <link rel="stylesheet" href="/assets/css/app.css" />
      </head>
      <body className={`${poppins.variable} font-sans`}>
        <Suspense fallback={null}>
          <SiteProviders>{children}</SiteProviders>
        </Suspense>
        <script src="/js/i18n/consentLocale.js" defer />
        <script src="/js/ui/consent/cookieConsent.js" defer />
        <script src="/js/ui/consent/googleAnalytics.js" defer />
      </body>
    </html>
  );
}
