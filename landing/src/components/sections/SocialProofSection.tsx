import { EXAM_FORMATS } from '@/lib/constants';
import { Container } from '@/components/ui/Container';

const PRODUCT_FACTS = [
  {
    title: 'CEFR A1–C2',
    desc: 'Goethe, Cambridge, DELE and other official certifications at every level — A1 to C2.',
  },
  {
    title: 'Four skills',
    desc: 'Reading, listening, writing, and speaking in official exam format.',
  },
  {
    title: 'Adaptive practice',
    desc: 'Save words you miss; with Pro, generate personalized mock exams from your deck.',
  },
  {
    title: 'Sample demo',
    desc: 'Try a static sample exam free — no login and no AI quota consumed.',
  },
];

export function SocialProofSection() {
  return (
    <section className="border-y border-[var(--border)] bg-[var(--bg-elevated)]/40">
      <Container className="py-12 md:py-14">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-[var(--brand)]">
          Private beta
        </p>
        <p className="mx-auto mb-10 max-w-xl text-center text-sm font-semibold text-[var(--text-secondary)]">
          Built for students preparing for official language certifications worldwide.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {EXAM_FORMATS.map((name) => (
            <span key={name} className="text-sm font-semibold text-[var(--text-muted)] md:text-base">
              {name}
            </span>
          ))}
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCT_FACTS.map((item) => (
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
