import { Container } from '@/components/ui/Container';

const BENEFITS = [
  {
    title: 'Turn mistakes into progress',
    desc: 'No wasted study time. Every wrong answer becomes your next targeted lesson.',
    icon: '🎯',
  },
  {
    title: 'Know if you are ready',
    desc: 'A clear readiness estimate per exam goal — walk in confident, not guessing.',
    icon: '📈',
  },
  {
    title: 'Personalized in seconds',
    desc: 'Generate a full mock exam from your own weak vocabulary whenever you want to practice.',
    icon: '⚡',
  },
];

export function BenefitsSection() {
  return (
    <section className="section-pad bg-[var(--bg-base)]">
      <Container className="max-w-[1120px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="lc-badge mb-4 mx-auto w-fit">Why LexiCoil</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl lg:text-5xl">
            Built to pass exams, not to play games
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="surface-card p-6 md:p-8">
              <span
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-xl"
                style={{ background: 'var(--brand-light)' }}
              >
                {b.icon}
              </span>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">{b.title}</h3>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text-secondary)]">
                {b.desc}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
