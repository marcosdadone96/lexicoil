export const APP_URL = '/app.html';

export const EXAM_FORMATS = [
  'Goethe-Institut',
  'Cambridge English',
  'DELE · Instituto Cervantes',
  'Official CEFR levels A1–C2',
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
