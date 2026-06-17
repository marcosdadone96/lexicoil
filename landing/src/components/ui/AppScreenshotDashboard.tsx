/** Faithful inline preview of the post-refactor dashboard (anexo A / Fases 1–4). */
export function AppScreenshotDashboard() {
  return (
    <div className="p-4 text-left md:p-5" style={{ fontFamily: 'var(--lc-font)' }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">My exam goals</p>
          <p className="text-sm font-bold text-[var(--text-primary)]">Goethe B1 · DE</p>
        </div>
        <div className="relative flex h-[72px] w-[72px] items-center justify-center">
          <svg width="72" height="72" viewBox="0 0 84 84" aria-hidden="true">
            <circle cx="42" cy="42" r="36" fill="none" stroke="var(--bg-elevated)" strokeWidth="8" />
            <circle
              cx="42"
              cy="42"
              r="36"
              fill="none"
              stroke="var(--success)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray="226"
              strokeDashoffset="72"
              transform="rotate(-90 42 42)"
            />
          </svg>
          <span className="absolute text-sm font-extrabold text-[var(--text-primary)]">68%</span>
        </div>
      </div>

      <div
        className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] p-4 sm:flex-row sm:items-center"
        style={{ background: 'linear-gradient(120deg, var(--brand-light), #eef2ff)' }}
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg text-white"
          style={{ background: 'var(--brand)' }}
        >
          🚀
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--brand)]">
            Recommended next step
          </p>
          <p className="text-base font-bold text-[var(--text-primary)]">Take a practice exam</p>
          <p className="text-xs font-semibold text-[var(--text-secondary)]">
            Listening and Writing need more work.
          </p>
        </div>
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-xl px-4 py-2 text-xs font-bold text-white"
          style={{ background: 'var(--brand)' }}
        >
          Start now →
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: 'Words saved', value: '214', delta: '+32 wk' },
          { label: 'Practice exams', value: '12', delta: '+2 wk' },
          { label: 'Study streak', value: '7d', delta: '' },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <p className="text-[10px] font-semibold text-[var(--text-muted)]">{k.label}</p>
            <p className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">{k.value}</p>
            {k.delta ? (
              <p className="text-[10px] font-semibold text-[var(--success)]">{k.delta}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
