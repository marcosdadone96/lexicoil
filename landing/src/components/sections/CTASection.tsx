'use client';

import { useAuthUi } from '@/context/AuthUiContext';
import { Container } from '@/components/ui/Container';

export function CTASection() {
  const { openAuth } = useAuthUi();

  return (
    <section className="section-pad">
      <Container className="max-w-[1120px]">
        <div
          className="relative overflow-hidden rounded-[20px] px-8 py-16 text-center md:px-16 md:py-20"
          style={{
            background: 'linear-gradient(120deg, var(--brand), var(--teal))',
            color: '#fff',
            boxShadow: 'var(--shadow-hero)',
          }}
        >
          <h2 className="font-display text-3xl tracking-tight md:text-4xl lg:text-[2rem]">
            Your exam date is coming. Be ready.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg font-semibold opacity-95">
            Take your first practice exam and turn today&apos;s mistakes into tomorrow&apos;s pass.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/demo"
              className="inline-flex items-center justify-center rounded-xl bg-white px-8 py-4 text-base font-bold text-[var(--brand)]"
            >
              Try a sample exam →
            </a>
            <button
              type="button"
              onClick={() => openAuth('register')}
              className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/10 px-8 py-4 text-base font-bold text-white hover:bg-white/15"
            >
              Create free account
            </button>
          </div>
        </div>
      </Container>
    </section>
  );
}
