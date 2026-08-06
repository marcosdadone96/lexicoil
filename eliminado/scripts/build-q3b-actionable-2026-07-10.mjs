/**
 * Build depurated actionable Q3-B findings after non_sequitur human audit.
 *   node scripts/build-q3b-actionable-2026-07-10.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const report = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/gate-logs/Q3B-SWEEP-134-2026-07-10.json'), 'utf8'),
);

const confirmedNs = [
  { file: 'horen-t2-gemini-017.json', quoteNeedle: /Zugang zu Bildung/i },
  { file: 'lesen-t2-gemini-055.json', quoteNeedle: /eingetreten/i },
  { file: 'lesen-t2-gemini-055.json', quoteNeedle: /im freien Stress/i },
  { file: 'lesen-t3-auto-zspq8n.json', quoteNeedle: /Holzstuhl|für die kleine/i },
  { file: 'lesen-t5-gemini-015.json', quoteNeedle: /ganztägig/i },
  { file: 'lesen-t5-gemini-015.json', quoteNeedle: /München/i },
  { file: 'schreiben-gemini-010.json', quoteNeedle: /Transport zu seinem Haus/i },
];

const actionable = [];
const heldNs = [];

for (const f of report.filesWithFindings) {
  for (const x of f.findings || []) {
    const row = {
      file: f.file,
      axis: x.axis,
      reason: x.reason,
      severity: x.severity,
      field: x.field || null,
      passageId: x.passageId || null,
      questionId: x.questionId || null,
      quote: x.quote || '',
      detail: x.detail || '',
    };
    if (x.axis === 'naturalness' && x.reason === 'non_sequitur') {
      const conf = confirmedNs.find(
        (c) =>
          c.file === f.file &&
          (c.quoteNeedle.test(x.quote || '') || c.quoteNeedle.test(x.detail || '')),
      );
      if (conf) {
        actionable.push({ ...row, status: 'confirmed_real', source: 'non_sequitur_sample' });
      } else {
        heldNs.push({ ...row, status: 'held_pending_prompt_v1.3' });
      }
    } else {
      actionable.push({ ...row, status: 'deliver_for_manual', source: 'other_axis' });
    }
  }
}

const byReason = {};
for (const a of actionable) {
  const k = `${a.axis}/${a.reason}`;
  byReason[k] = (byReason[k] || 0) + 1;
}

const out = {
  generatedAt: new Date().toISOString(),
  verdict: 'non_sequitur_held_FP_65pct_sample',
  sample: { n: 20, real: 7, fp: 13, fpPct: 65 },
  counts: {
    actionable: actionable.length,
    heldNonSequitur: heldNs.length,
    byReasonActionable: byReason,
  },
  actionable,
  heldNonSequitur: heldNs,
};

const logDir = path.join(ROOT, 'batches/ready/gate-logs');
fs.writeFileSync(
  path.join(logDir, 'Q3B-ACTIONABLE-FINDINGS-2026-07-10.json'),
  `${JSON.stringify(out, null, 2)}\n`,
);

const lines = [
  '# Q3-B findings accionables (depurados) — 2026-07-10',
  '',
  'Veredicto non_sequitur: **HOLD** (65% FP en muestra 20). Solo 7 non_sequitur confirmados REAL.',
  'Otros ejes: entregados completos para corrección manual.',
  '',
  `Total accionable: **${actionable.length}** · Held non_sequitur: **${heldNs.length}**`,
  '',
  '## Confirmados REAL (non_sequitur muestra)',
  '',
];

for (const a of actionable.filter((x) => x.source === 'non_sequitur_sample')) {
  lines.push(`- **${a.file}** · \`${a.field || '?'}\` · «${(a.quote || '').slice(0, 100)}»`);
  lines.push(`  - ${a.detail}`);
}

lines.push('', '## Otros ejes (manual)', '');
const other = actionable.filter((x) => x.source === 'other_axis');
const groups = {};
for (const a of other) {
  const k = `${a.axis}/${a.reason}`;
  (groups[k] ||= []).push(a);
}
for (const [k, items] of Object.entries(groups).sort()) {
  lines.push(`### ${k} (${items.length})`, '');
  for (const a of items) {
    lines.push(`- **${a.file}** · \`${a.field || '?'}\` · «${(a.quote || '').slice(0, 90)}»`);
    lines.push(`  - ${(a.detail || '').slice(0, 220)}`);
  }
  lines.push('');
}
lines.push('## Held non_sequitur (no corregir aún)', '');
lines.push(
  `${heldNs.length} findings retenidos hasta prompt v1.3. Ver Q3B-NONSEQUITUR-AUDIT-2026-07-10.md.`,
  '',
);
for (const a of heldNs) {
  lines.push(`- **${a.file}** · «${(a.quote || '').slice(0, 80)}»`);
}

fs.writeFileSync(path.join(logDir, 'Q3B-ACTIONABLE-FINDINGS-2026-07-10.md'), `${lines.join('\n')}\n`);
console.log(JSON.stringify(out.counts, null, 2));
console.log(
  'confirmed ns:',
  actionable
    .filter((x) => x.source === 'non_sequitur_sample')
    .map((x) => `${x.file} :: ${(x.quote || '').slice(0, 50)}`),
);
