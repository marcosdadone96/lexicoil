export const APP_URL = '/app.html';

/** Static offline demo — no account, no AI quota (`/demo` redirects here on Netlify). */
export const DEMO_URL = '/demo.html';

/** Only this combo is fully available at launch; others are SEO/waitlist. */
export const LAUNCH_LIVE_EXAM = { lang: 'de', level: 'B1' } as const;

export function isExamLiveAtLaunch(lang: string, level: string): boolean {
  return lang === LAUNCH_LIVE_EXAM.lang && level === LAUNCH_LIVE_EXAM.level;
}

export function appUrlForExam(lang: string, level: string): string {
  return `${APP_URL}?lang=${lang}&level=${level}`;
}

export const LAUNCH_APP_URL = appUrlForExam(LAUNCH_LIVE_EXAM.lang, LAUNCH_LIVE_EXAM.level);

/** Public pricing — keep in sync with AI_CREDITS_* env and Stripe prices. */export const PLAN_PRICING = {
  free: {
    priceLabel: 'EUR 0',
    examsPerMonth: 5,
    aiCreditsPerMonth: 6,
    poolPreview: 2,
  },
  pro: {
    priceLabel: 'EUR 13',
    examsPerMonth: 12,
    aiCreditsPerMonth: 40,
  },
  proMax: {
    priceLabel: 'EUR 24',
    examsPerMonth: 12,
    aiCreditsPerMonth: 150,
  },
} as const;

export const EXAM_FORMATS = [
  'Goethe B1 — available now',
  'Cambridge English — coming soon',
  'DELE · Instituto Cervantes — coming soon',
  'More CEFR levels A1–C2 — coming soon',
  'Reading · Listening · Writing · Speaking',
] as const;
export const EXAM_SEO_PAGES = [
  { slug: 'goethe-a1', title: 'Goethe A1', cert: 'Start Deutsch 1', lang: 'de', level: 'A1' },
  { slug: 'goethe-a2', title: 'Goethe A2', cert: 'Start Deutsch 2', lang: 'de', level: 'A2' },
  { slug: 'goethe-b1', title: 'Goethe B1', cert: 'Goethe-Zertifikat B1', lang: 'de', level: 'B1' },
  { slug: 'goethe-b2', title: 'Goethe B2', cert: 'Goethe-Zertifikat B2', lang: 'de', level: 'B2' },
  { slug: 'goethe-c1', title: 'Goethe C1', cert: 'Goethe-Zertifikat C1', lang: 'de', level: 'C1' },
  { slug: 'cambridge-b1', title: 'Cambridge B1', cert: 'PET / B1 Preliminary', lang: 'en', level: 'B1' },
  { slug: 'cambridge-b2', title: 'Cambridge B2', cert: 'FCE / B2 First', lang: 'en', level: 'B2' },
  { slug: 'cambridge-c1', title: 'Cambridge C1', cert: 'CAE / C1 Advanced', lang: 'en', level: 'C1' },
] as const;
