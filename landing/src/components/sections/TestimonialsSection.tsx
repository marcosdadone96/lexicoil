import { Container } from '@/components/ui/Container';

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
            Honest positioning — what LexiCoil does today, not marketing promises.
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

        <p className="mx-auto mt-10 max-w-xl text-center text-sm font-semibold text-[var(--text-muted)]">
          Private beta — we do not publish fake reviews or invented student counts. Early users shape
          the product; your feedback matters more than a star rating.
        </p>
      </Container>
    </section>
  );
}
