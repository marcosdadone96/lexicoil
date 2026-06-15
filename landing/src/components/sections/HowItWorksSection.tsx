import { Container } from '@/components/ui/Container';

const STEPS = [
  {
    title: 'Take an exam',
    desc: 'Start with a Goethe or Cambridge-style practice test under official conditions. This is your baseline — not yet personalized.',
    tag: 'Practice exam',
  },
  {
    title: 'We find your gaps',
    desc: 'Every mistake is detected and saved as vocabulary evidence from real exam questions.',
    tag: 'Vocabulary evidence',
  },
  {
    title: 'Practice what matters',
    desc: 'Flashcards on every plan. With Pro, personalized exams built only from your weak areas.',
    tag: 'Personalized exam',
  },
  {
    title: 'Watch readiness rise',
    desc: 'See your estimated readiness climb with every session until you are ready to pass.',
    tag: 'Progress',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="section-pad">
      <Container className="max-w-[1120px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="lc-badge mb-4 mx-auto w-fit">How it works</p>
          <h2 className="font-display text-3xl tracking-tight text-[var(--text-primary)] md:text-4xl lg:text-5xl">
            Learn only what you don&apos;t know
          </h2>
          <p className="mt-4 text-lg font-semibold text-[var(--text-secondary)]">
            One simple loop that gets you exam-ready faster than studying everything.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div key={step.title} className="surface-card relative p-6 text-center">
              <div
                className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white"
                style={{ background: 'var(--brand)' }}
              >
                {i + 1}
              </div>
              <span className="lc-badge mb-2">{step.tag}</span>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">{step.title}</h3>
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
