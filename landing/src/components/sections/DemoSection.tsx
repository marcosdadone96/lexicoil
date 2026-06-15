import { Container } from '@/components/ui/Container';
import { ProductFrame } from '@/components/ui/ProductFrame';
import { AppScreenshotWorkspace } from '@/components/ui/AppScreenshotWorkspace';

const LOOP = [
  { step: '1', label: 'Take a practice exam', detail: 'Official or adaptive mode from your goal workspace.' },
  { step: '2', label: 'Save words you miss', detail: 'Click difficult words in practice mode — they enter your deck.' },
  { step: '3', label: 'Generate a personalized exam', detail: 'Pro: select saved words and get a new test built from your gaps.' },
  { step: '4', label: 'Track readiness', detail: 'Skills, score trend, and coach recommendations on your dashboard.' },
];

export function DemoSection() {
  return (
    <section id="exams" className="section-pad bg-[var(--bg-elevated)]/50">
      <Container className="max-w-[1120px]">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl lg:text-5xl">
            See LexiCoil in action
          </h2>
          <p className="mt-4 text-lg text-[var(--text-secondary)]">
            From mistake to mastery — inside the app you use after signing up.
          </p>
        </div>

        <div className="mt-14 grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <ProductFrame
            url="app.lexicoil.com/workspace/goethe-b1"
            caption="Goal workspace — Exams, Vocabulary, and Progress in one place"
          >
            <AppScreenshotWorkspace />
          </ProductFrame>

          <div className="space-y-4">
            {LOOP.map((item) => (
              <div key={item.step} className="surface-card flex gap-4 p-5">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                  style={{ background: 'var(--brand)' }}
                >
                  {item.step}
                </div>
                <div>
                  <p className="font-bold text-[var(--text-primary)]">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--text-secondary)]">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
            <a href="/demo" className="btn-primary mt-2 inline-flex w-full justify-center py-4 text-base sm:w-auto">
              Try the sample exam first →
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}
