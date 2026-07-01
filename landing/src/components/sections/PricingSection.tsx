'use client';

import { useAuthUi } from '@/context/AuthUiContext';
import { tryExamAsGuest } from '@/lib/tryExam';
import { PLAN_PRICING } from '@/lib/constants';
import { Container } from '@/components/ui/Container';

const PLANS = [
  {
    name: 'Free',
    price: PLAN_PRICING.free.priceLabel,
    period: 'month',
    desc: 'One certification to start. No credit card required.',
    features: [
      `${PLAN_PRICING.free.examsPerMonth} official mock exams per month`,
      `${PLAN_PRICING.free.aiCreditsPerMonth} AI credits/month (quiz, speaking, writing, listening game)`,
      `${PLAN_PRICING.free.poolPreview} curated pool exams as a preview`,
      'One language & level (e.g. Goethe B1)',
      'Vocabulary deck & flashcards',
      'Retake saved exams (free)',
    ],
    cta: 'Try 5-min demo',
    popular: false,
    guest: true,
  },
  {
    name: 'Pro',
    price: PLAN_PRICING.pro.priceLabel,
    period: 'month',
    desc: 'Billed monthly. Cancel anytime.',
    features: [
      `${PLAN_PRICING.pro.examsPerMonth} exam generations per month`,
      `${PLAN_PRICING.pro.aiCreditsPerMonth} AI credits/month (roll over unused)`,
      'Personalized exams from your vocabulary',
      'Full exam pool · grammar coaching · TTS',
      'Full AI writing & speaking feedback',
      'Roadmap: all languages & levels · cloud sync',
    ],
    cta: 'Create account',
    popular: true,
    guest: false,
  },
  {
    name: 'Pro Max',
    price: PLAN_PRICING.proMax.priceLabel,
    period: 'month',
    desc: 'For intensive prep — same Pro access, larger AI pool.',
    features: [
      `${PLAN_PRICING.proMax.examsPerMonth} exam generations per month`,
      `${PLAN_PRICING.proMax.aiCreditsPerMonth} AI credits/month`,
      'Everything in Pro',
      'Best for daily AI speaking & writing practice',
    ],
    cta: 'Create account',
    popular: false,
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
            Free includes {PLAN_PRICING.free.aiCreditsPerMonth} AI credits every month. Upgrade for personalized
            exams and unlimited pool access.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-8 md:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`surface-card relative p-8 ${
                plan.popular ? 'border-[var(--brand)] ring-2 ring-[var(--brand)]/20 md:col-span-2 lg:col-span-1' : ''
              }`}
            >
              {plan.popular && (
                <span className="lc-badge absolute -top-3 left-1/2 -translate-x-1/2 !bg-[var(--brand)] !text-white">
                  Most popular
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

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs font-semibold text-[var(--text-muted)]">
          AI credits renew monthly. Speaking costs 2 credits · vocab quiz 2 · writing & listening game 1 ·
          personalized exams 3 (Pro only). Sample demos never use your quota.
        </p>
      </Container>
    </section>
  );
}
