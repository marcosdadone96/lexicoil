import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const files = {
  'landing/src/lib/constants.ts': `export const APP_URL = '/app.html';

export const EXAM_FORMATS = [
  'Goethe-Institut',
  'Cambridge English',
  'Official CEFR levels A1\u2013C2',
  'Reading \u00b7 Listening \u00b7 Writing \u00b7 Speaking',
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
`,

  'landing/src/components/sections/FAQSection.tsx': `'use client';

import { useState } from 'react';
import { Container } from '@/components/ui/Container';

const FAQS = [
  {
    q: 'Do I need an account to start?',
    a: 'No. Start the 5-minute product demo to experience the product without an account. Create a free account afterward to save vocabulary, exam history, and readiness tracking \u2014 plus 20 standard exams per month.',
  },
  {
    q: 'What is the difference between a practice exam and a personalized exam?',
    a: 'A practice exam is a general mock test on an official topic \u2014 your baseline assessment. A personalized exam is generated from vocabulary you saved during practice and targets only your weak words. Personalized exams require Pro.',
  },
  {
    q: 'Can I use LexiCoil for Goethe B2?',
    a: 'Yes. LexiCoil supports Goethe A1 through C2 with official-format modules: Leseverstehen, H\u00f6rverstehen, Schreiben, and Sprechen.',
  },
  {
    q: 'How does personalized practice work?',
    a: "During practice mode, click any word you don't know to save it to your deck. With Pro, select words and LexiCoil generates a mock exam weaving those items into realistic questions \u2014 plus a listening game and AI speaking practice.",
  },
  {
    q: 'How many exams can I generate?',
    a: 'Free accounts get 20 standard exams per month from the question library. Pro is a one-time upgrade for 50 exams per month plus personalized vocabulary practice. Sample demos and retaking saved exams never count against your quota.',
  },
  {
    q: 'Does LexiCoil replace Goethe or Cambridge materials?',
    a: 'No \u2014 it complements them. Use official Modellsaetze for familiarity, then use LexiCoil to target vocabulary you personally struggle with.',
  },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="section-pad">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl tracking-tight text-[var(--text-primary)] md:text-4xl lg:text-5xl">
            Frequently asked questions
          </h2>
        </div>

        <div className="surface-card mx-auto mt-12 max-w-3xl divide-y divide-[var(--border)]">
          {FAQS.map((item, i) => (
            <div key={item.q}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span className="font-semibold text-[var(--text-primary)]">{item.q}</span>
                <span className="shrink-0 text-[var(--text-muted)]">{open === i ? '\u2212' : '+'}</span>
              </button>
              {open === i && (
                <div className="px-6 pb-5 text-sm font-semibold leading-relaxed text-[var(--text-secondary)]">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
`,

  'landing/src/components/sections/HowItWorksSection.tsx': `import { Container } from '@/components/ui/Container';

const STEPS = [
  {
    title: 'Take a practice exam',
    desc: 'A general Goethe or Cambridge mock test on an official topic. This is your baseline assessment \u2014 not yet personalized.',
    tag: 'Practice exam',
  },
  {
    title: 'Save words you miss',
    desc: 'In practice mode, click any difficult word. LexiCoil saves it as evidence from your real mistakes.',
    tag: 'Vocabulary evidence',
  },
  {
    title: 'Generate a personalized exam',
    desc: 'Select saved words from your deck. LexiCoil builds a new official-format test using only your weak vocabulary.',
    tag: 'Personalized exam',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="section-pad">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl tracking-tight text-[var(--text-primary)] md:text-4xl lg:text-5xl">
            How LexiCoil works
          </h2>
          <p className="mt-4 text-lg font-semibold text-[var(--text-secondary)]">
            Practice exam first. Personalization comes from your mistakes \u2014 not on day one.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="relative text-center">
              <div
                className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-lg font-bold text-[var(--brand)]"
                style={{ background: 'var(--brand-light)' }}
              >
                {i + 1}
              </div>
              <span className="lc-badge mb-2">{step.tag}</span>
              <h3 className="text-xl font-bold text-[var(--text-primary)]">{step.title}</h3>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text-secondary)]">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
`,

  'landing/src/components/sections/SocialProofSection.tsx': `import { EXAM_FORMATS } from '@/lib/constants';
import { Container } from '@/components/ui/Container';

export function SocialProofSection() {
  return (
    <section className="border-y border-[var(--border)] bg-[var(--bg-elevated)]/40">
      <Container className="py-12 md:py-14">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-[var(--brand)]">
          Now in public beta
        </p>
        <p className="mx-auto mb-10 max-w-xl text-center text-sm font-semibold text-[var(--text-secondary)]">
          Built for students preparing for official Goethe and Cambridge certifications. Try the
          5-minute product demo first \u2014 no account required.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {EXAM_FORMATS.map((name) => (
            <span key={name} className="text-sm font-semibold text-[var(--text-muted)] md:text-base">
              {name}
            </span>
          ))}
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-4 md:grid-cols-3">
          {[
            {
              title: 'Practice exam',
              desc: 'General assessment on official topics. Find out where you stand.',
            },
            {
              title: 'Save weak words',
              desc: 'In practice mode, click vocabulary you miss. Each word becomes evidence.',
            },
            {
              title: 'Personalized exam',
              desc: 'Generate a new test from words you selected \u2014 not random topics.',
            },
          ].map((item) => (
            <div key={item.title} className="surface-card p-5 text-center">
              <p className="text-sm font-bold text-[var(--text-primary)]">{item.title}</p>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--text-secondary)]">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
`,
};

// Hero is large - write separately in script continuation
files['landing/src/components/sections/HeroSection.tsx'] = `'use client';

import { useAuthUi } from '@/context/AuthUiContext';
import { tryExamAsGuest } from '@/lib/tryExam';
import { Container } from '@/components/ui/Container';

export function HeroSection() {
  const { openAuth } = useAuthUi();

  return (
    <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, var(--brand-light), transparent), var(--bg-base)',
        }}
      />
      <Container className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="animate-fade-up">
            <div className="lc-badge mb-5">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[var(--brand)]" />
              Public beta \u00b7 Adaptive exam preparation
            </div>

            <h1 className="font-display text-[2.75rem] leading-[1.08] tracking-tight text-[var(--text-primary)] md:text-[3.5rem] lg:text-[4.25rem]">
              Every mistake becomes your{' '}
              <span className="text-[var(--brand)]">next lesson.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg font-semibold leading-relaxed text-[var(--text-secondary)] md:text-xl">
              Take a Goethe or Cambridge practice test, save the vocabulary you miss, and generate
              personalized exams from your weaknesses \u2014 not random topics.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" onClick={tryExamAsGuest} className="btn-primary px-8 py-4 text-base">
                Try 5-minute demo
              </button>
              <button type="button" onClick={() => openAuth('register')} className="btn-secondary px-8 py-4 text-base">
                Create free account
              </button>
            </div>

            <p className="mt-4 text-sm font-semibold text-[var(--text-muted)]">
              No signup required to start. Create an account after the demo to save progress across devices.
            </p>
          </div>

          <div className="relative animate-fade-up">
            <div
              className="absolute -inset-4 rounded-[28px] opacity-40"
              style={{ background: 'var(--shadow-hero)' }}
            />
            <div className="surface-card relative p-5 md:p-6" style={{ boxShadow: 'var(--shadow-hero)' }}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Practice exam
                  </p>
                  <p className="font-bold text-[var(--text-primary)]">Goethe B2 \u00b7 Leseverstehen</p>
                </div>
                <span className="rounded-lg bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                  Q 4/12
                </span>
              </div>

              <p className="mb-4 text-sm font-semibold leading-relaxed text-[var(--text-secondary)]">
                Welche Aussage zum Thema <strong className="text-[var(--text-primary)]">Nachhaltigkeit</strong>{' '}
                stimmt mit dem Text \u00fcberein?
              </p>

              <div className="space-y-2">
                <div className="rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
                  A) Die Ma\u00dfnahmen sind bereits ausreichend.
                  <span className="mt-1 block text-xs font-bold text-red-500">Incorrect</span>
                </div>
                <div className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]">
                  B) ...
                </div>
                <div className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]">
                  C) ...
                </div>
              </div>

              <div
                className="mt-5 rounded-xl border p-4"
                style={{ borderColor: 'var(--brand)', background: 'var(--brand-light)' }}
              >
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--brand)]">
                  Words you missed
                </p>
                <div className="flex flex-wrap gap-2">
                  {['Nachhaltigkeit', 'ausreichend', 'Ma\u00dfnahmen'].map((w) => (
                    <span
                      key={w}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]"
                    >
                      {w}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs font-semibold text-[var(--text-secondary)]">
                  \u2192 Saved to your deck \u2192 Personalized exam
                </p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
`;

files['landing/src/components/sections/TestimonialsSection.tsx'] = `import { Container } from '@/components/ui/Container';

const VALUES = [
  {
    title: 'Learn only what you do not know',
    desc: 'Stop reviewing vocabulary you already mastered. Every session targets your actual gaps from real exam questions.',
  },
  {
    title: 'Turn mistakes into progress',
    desc: 'Each wrong answer can become a saved word, a flashcard review, or a personalized mock exam.',
  },
  {
    title: 'Pass your exam faster',
    desc: 'Focused repetition on weak areas compounds faster than generic language courses or random word lists.',
  },
  {
    title: 'Official exam format',
    desc: 'Goethe and Cambridge-style modules: reading, listening, writing, and speaking at your target CEFR level.',
  },
];

export function TestimonialsSection() {
  return (
    <section className="section-pad">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl tracking-tight text-[var(--text-primary)] md:text-4xl lg:text-5xl">
            Why adaptive exam prep works
          </h2>
          <p className="mt-4 text-lg font-semibold text-[var(--text-secondary)]">
            Honest positioning \u2014 what LexiCoil does today, not marketing promises.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {VALUES.map((v) => (
            <div key={v.title} className="surface-card p-6 md:p-8">
              <p className="text-base font-bold text-[var(--text-primary)]">{v.title}</p>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--text-secondary)]">
                {v.desc}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
`;

for (const [rel, content] of Object.entries(files)) {
  const full = path.join(root, rel);
  fs.writeFileSync(full, content, 'utf8');
  console.log('wrote', rel);
}
