import { Container } from '@/components/ui/Container';

type Cell = boolean | 'partial';

const ROWS: { label: string; lexicoil: Cell; duolingo: Cell; babbel: Cell; quizlet: Cell }[] = [
  { label: 'Built for official certifications', lexicoil: true, duolingo: false, babbel: false, quizlet: false },
  { label: 'Adapts to your real mistakes', lexicoil: true, duolingo: 'partial', babbel: 'partial', quizlet: false },
  { label: 'Readiness estimate per exam goal', lexicoil: true, duolingo: false, babbel: false, quizlet: false },
  { label: 'Personalized exams from your words', lexicoil: true, duolingo: false, babbel: false, quizlet: false },
  { label: 'Focus on outcomes over streaks', lexicoil: true, duolingo: false, babbel: true, quizlet: false },
];

function CellIcon({ value }: { value: Cell }) {
  if (value === true) {
    return <span className="text-sm font-bold text-[var(--success)]">✓</span>;
  }
  if (value === 'partial') {
    return <span className="text-xs font-semibold text-[var(--text-muted)]">Limited</span>;
  }
  return <span className="text-sm text-[var(--text-muted)]">—</span>;
}

export function ComparisonSection() {
  return (
    <section id="compare" className="section-pad">
      <Container className="max-w-[1120px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="lc-badge mb-4 mx-auto w-fit">Comparison</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl lg:text-5xl">
            Not another language app
          </h2>
          <p className="mt-4 text-lg font-semibold text-[var(--text-secondary)]">
            Duolingo sells habit. Quizlet sells memorization. LexiCoil sells adaptive exam preparation.
          </p>
        </div>

        <div className="surface-card mt-12 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="p-4 font-semibold text-[var(--text-secondary)]">What you get</th>
                <th className="p-4 font-medium text-[var(--text-secondary)]">Duolingo</th>
                <th className="p-4 font-medium text-[var(--text-secondary)]">Babbel</th>
                <th className="p-4 font-medium text-[var(--text-secondary)]">Quizlet</th>
                <th
                  className="p-4 font-bold text-[var(--brand-dark)]"
                  style={{ background: 'var(--brand-light)' }}
                >
                  LexiCoil
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-4 font-semibold text-[var(--text-primary)]">{row.label}</td>
                  <td className="p-4 text-center">
                    <CellIcon value={row.duolingo} />
                  </td>
                  <td className="p-4 text-center">
                    <CellIcon value={row.babbel} />
                  </td>
                  <td className="p-4 text-center">
                    <CellIcon value={row.quizlet} />
                  </td>
                  <td className="p-4 text-center font-bold" style={{ background: 'var(--brand-light)' }}>
                    <CellIcon value={row.lexicoil} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}
