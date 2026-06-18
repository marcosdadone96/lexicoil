'use client';

import { useAuthUi } from '@/context/AuthUiContext';
import { Container } from '@/components/ui/Container';
import { ProductFrame } from '@/components/ui/ProductFrame';
import { AppScreenshotDashboard } from '@/components/ui/AppScreenshotDashboard';

const PROMISE = [
  { bold: 'Study less.', rest: '' },
  { bold: 'Learn smarter.', rest: '' },
  { bold: 'Pass faster.', rest: '' },
];

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
      <Container className="relative max-w-[1120px]">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="animate-fade-up">
            <p className="lc-badge mb-5 w-fit">Adaptive exam preparation</p>

            <h1 className="font-display text-[2.75rem] leading-[1.08] tracking-tight text-[var(--text-primary)] md:text-[3.5rem] lg:text-[4rem]">
              Every mistake becomes your{' '}
              <span className="text-[var(--brand)]">next lesson.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg font-semibold leading-relaxed text-[var(--text-secondary)] md:text-xl">
              LexiCoil turns the questions you get wrong into a personalized path to your language
              certification — reading, listening, writing, and speaking at A1–C2.
            </p>

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[15px] font-bold text-[var(--text-primary)]">
              {PROMISE.map((p) => (
                <span key={p.bold}>
                  <span className="text-[var(--brand)]">{p.bold}</span>
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="/demo" className="btn-primary px-8 py-4 text-base text-center">
                Try a sample exam
              </a>
              <button
                type="button"
                onClick={() => openAuth('register')}
                className="btn-secondary px-8 py-4 text-base"
              >
                Create free account
              </button>
            </div>

            <p className="mt-4 text-sm font-semibold text-[var(--text-muted)]">
              Sample exam runs in your browser — no account or AI quota required.
            </p>
          </div>

          <div className="relative animate-fade-up">
            <ProductFrame
              url="app.lexicoil.com · Language exams"
              caption="Dashboard coach — readiness, KPIs, and your next step in one view"
            >
              <AppScreenshotDashboard />
            </ProductFrame>
          </div>
        </div>
      </Container>
    </section>
  );
}
