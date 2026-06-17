'use client';

import { useAuthUi } from '@/context/AuthUiContext';
import { tryExamAsGuest } from '@/lib/tryExam';
import { Container } from '@/components/ui/Container';

const PLANS = [
  {
    name: 'Free',
    price: 'EUR 0',
    period: 'month',
    desc: 'Try adaptive exam prep on one certification. No credit card required.',
    features: [
      '5 official mock exams per month',
      'One language & level (e.g. Goethe B1)',
      'Practice and official exam modes',
      'Vocabulary deck & flashcards',
      'Retake saved exams (free)',
    ],
    cta: 'Try 5-min demo',
    popular: false,
    guest: true,
  },
  {
    name: 'Pro',
    price: 'EUR 9.99',
    period: 'month',
    desc: 'Billed monthly. Cancel anytime.',
    features: [
      '12 exam generations per month',
      'Personalized mock exams from your deck',
      'Listening game & AI speaking practice',
      'PDF correction reports',
      'Cloud sync across devices',
      'Everything in Free',
    ],
    cta: 'Create account',
    popular: true,
    guest: false,
  },
];

export function PricingSection() {
  const { openAuth } = useAuthUi();

  return (
    <section id="pricing" className="section-pad bg-[var(--bg-elevated)]/50">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl tracking-tight text-[var(--text-primary)] md:text-4xl lg:text-5xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg font-semibold text-[var(--text-secondary)]">
            Try the 5-minute product demo free. Create an account when you are ready to save progress.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-3xl gap-8 md:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`surface-card relative p-8 ${
                plan.popular ? 'border-[var(--brand)] ring-2 ring-[var(--brand)]/20' : ''
              }`}
            >
              {plan.popular && (
                <span className="lc-badge absolute -top-3 left-1/2 -translate-x-1/2 !bg-[var(--brand)] !text-white">
                  Pro
                </span>
              )}
              <h3 className="text-lg font-bold text-[var(--text-primary)]">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-[var(--text-primary)]">{plan.price}</span>
                <span className="text-sm font-semibold text-[var(--text-muted)]">/ {plan.period}</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-[var(--text-secondary)]">{plan.desc}</p>
              <ul className="mt-6 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm font-semibold text-[var(--text-primary)]">
                    <span className="mt-0.5 text-[var(--brand)]">+</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => (plan.guest ? tryExamAsGuest() : openAuth('register'))}
                className={`mt-8 w-full ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
