/** Faithful inline preview of the Exams workspace tab (anexo B / Fase 2). */
export function AppScreenshotWorkspace() {
  const exams = [
    { name: 'Official', color: 'var(--success)', bg: 'rgba(16,185,129,.1)', icon: '🛡' },
    { name: 'Practice', color: 'var(--brand)', bg: 'var(--brand-light)', icon: '📄' },
    { name: 'Personalized', color: '#7c3aed', bg: 'rgba(124,58,237,.1)', icon: '✦' },
    { name: 'Oral', color: '#ea580c', bg: 'rgba(234,88,12,.1)', icon: '🎤' },
  ];

  return (
    <div className="p-4 text-left md:p-5" style={{ fontFamily: 'var(--lc-font)' }}>
      <div className="mb-3">
        <p className="text-lg font-bold text-[var(--text-primary)]">
          Goethe B1 <span className="ml-1 rounded-md bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">DE</span>
        </p>
        <p className="text-xs font-semibold text-[var(--text-muted)]">Exam date: 12 Sep 2026 · 72 days left</p>
      </div>

      <div className="mb-4 flex gap-5 border-b border-[var(--border)]">
        {['Exams', 'Vocabulary', 'Progress'].map((tab, i) => (
          <span
            key={tab}
            className={`pb-2 text-sm font-semibold ${i === 0 ? 'border-b-2 border-[var(--brand)] text-[var(--brand)]' : 'text-[var(--text-muted)]'}`}
          >
            {tab}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {exams.map((e) => (
          <div
            key={e.name}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-surface)] p-3"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-[10px] text-sm"
                style={{ background: e.bg, color: e.color }}
              >
                {e.icon}
              </span>
              <span className="text-sm font-bold text-[var(--text-primary)]">{e.name}</span>
            </div>
            <div
              className="h-1.5 w-full rounded-full"
              style={{ background: e.color, opacity: 0.85 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
