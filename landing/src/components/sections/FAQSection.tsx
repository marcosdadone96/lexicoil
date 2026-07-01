'use client';

import { useState } from 'react';
import { PLAN_PRICING } from '@/lib/constants';
import { Container } from '@/components/ui/Container';

const FAQS = [
  {
    q: 'Do I need an account to start?',
    a: `No. Start the 5-minute product demo to experience the product without an account. Create a free account afterward to save vocabulary, exam history, and readiness tracking — plus ${PLAN_PRICING.free.examsPerMonth} official mock exams and ${PLAN_PRICING.free.aiCreditsPerMonth} AI credits per month on one certification.`,
  },
  {
    q: 'What is the difference between a practice exam and a personalized exam?',
    a: 'A practice exam is a general mock test on an official topic — your baseline assessment. A personalized exam is generated from vocabulary you saved during practice and targets only your weak words. Personalized exams require Pro (3 AI credits each).',
  },
  {
    q: 'What can I do with free AI credits?',
    a: `Free accounts get ${PLAN_PRICING.free.aiCreditsPerMonth} AI credits every month — not just the first month. Use them for AI vocab quizzes (2 credits), speaking practice (2), basic writing feedback (1), and the listening game (1). Personalized exams and grammar coaching stay Pro-only.`,
  },
  {
    q: 'Can I use LexiCoil for Goethe B2?',
    a: 'Goethe B1 is fully available at launch. Other Goethe levels (A1–C2), Cambridge, and DELE are on the roadmap — create a free Goethe B1 account now and we will add your goal as it goes live.',
  },
  {
    q: 'How many exams can I generate?',
    a: `Free: ${PLAN_PRICING.free.examsPerMonth} official mocks/month on one certification, plus ${PLAN_PRICING.free.poolPreview} pool exams as a preview. Pro is ${PLAN_PRICING.pro.priceLabel}/month (${PLAN_PRICING.pro.examsPerMonth} exams, ${PLAN_PRICING.pro.aiCreditsPerMonth} AI credits). Pro Max is ${PLAN_PRICING.proMax.priceLabel}/month with ${PLAN_PRICING.proMax.aiCreditsPerMonth} AI credits. Retakes and sample demos never count against quota.`,
  },
  {
    q: 'Does LexiCoil replace Goethe or Cambridge materials?',
    a: 'No — it complements them. Use official Modellsätze for familiarity, then use LexiCoil to target vocabulary you personally struggle with.',
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
                <span className="shrink-0 text-[var(--text-muted)]">{open === i ? '−' : '+'}</span>
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
