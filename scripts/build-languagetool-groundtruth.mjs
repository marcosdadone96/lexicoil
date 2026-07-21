#!/usr/bin/env node
/**
 * Build LanguageTool MUST_CATCH groundtruth from today's audit reports.
 *   node scripts/build-languagetool-groundtruth.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'scripts/lib/__tests__/languagetoolGate.groundtruth.json');

const STYLE = new Set([
  'WHITESPACE_RULE',
  'AUSLASSUNGSPUNKTE_LEERZEICHEN',
  'EINHEIT_LEERZEICHEN',
  'H2O',
  'MATHE',
  'DRAUF',
  'RAN_RUM_RAUF_REIN_RAUS_RUNTER_NEU',
  'SCHEISS_HAMMER_RIESEN',
  'DE_SIMPLE_REPLACE_COMMUNITIES',
]);

function extractReal(reportPath, source) {
  const j = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const rows = [];
  for (const f of j.files || []) {
    for (const pass of f.passages || []) {
      for (const m of pass.matches || []) {
        if (STYLE.has(m.ruleId)) continue;
        // Brand titles in quotes (Fit & Gesund) — DE_CASE FP, not exam grammar
        const ctx = m.context || '';
        if (
          m.ruleId === 'DE_CASE' &&
          (ctx.includes('\u201e') || ctx.includes('"') || ctx.includes("'") || ctx.includes('\u201c')) &&
          /Fit\s*&\s*Gesund|Gl\u00fcckliche Kinder/i.test(ctx)
        ) {
          continue;
        }
        const text = pass.text || '';
        const span = text.slice(m.offset, m.offset + m.length);
        const start = Math.max(0, m.offset - 40);
        const end = Math.min(text.length, m.offset + m.length + 40);
        rows.push({
          id: `${String(f.file).replace(/\.json$/, '')}-${m.ruleId}-${m.offset}`,
          file: f.file,
          passageIndex: pass.passageIndex,
          ruleId: m.ruleId,
          span,
          offset: m.offset,
          length: m.length,
          window: text.slice(start, end),
          message: m.message,
          source,
        });
      }
    }
  }
  return rows;
}

const first = extractReal(
  path.join(ROOT, 'batches/ready/gate-logs/languagetool-audit-2026-07-11.json'),
  'languagetool-audit-2026-07-11',
);

const seen = new Set(first.map((r) => `${r.file}|${r.ruleId}|${r.span}`));
const later = [];
for (const name of [
  'languagetool-horen-t1-staging-2026-07-11.json',
  'languagetool-horen-t1-final-2026-07-11.json',
  'languagetool-p03-15-2026-07-11.json',
  'languagetool-canary-staging-2026-07-11.json',
]) {
  const p = path.join(ROOT, 'batches/ready/gate-logs', name);
  if (!fs.existsSync(p)) continue;
  for (const row of extractReal(p, name.replace(/\.json$/, ''))) {
    if (row.ruleId === 'NOMEN_KLEIN' && row.span === 'ideal') continue;
    if (row.ruleId === 'FEHLERHAFTES_KOMMA_ALLG' && /, hast/.test(row.span || '')) continue;
    const key = `${row.file}|${row.ruleId}|${row.span}`;
    if (seen.has(key)) continue;
    seen.add(key);
    later.push({ ...row, id: `${row.id}-later` });
  }
}

const gt = {
  generatedAt: new Date().toISOString(),
  policy: {
    noiseRuleIds: [...STYLE],
    firstRunRealCount: first.length,
    laterRealCount: later.length,
    note:
      'MUST_CATCH = 58 real findings from first full pool audit (171 − whitespace/style noise) + later non-duplicate real hits. Live LT recheck soft-skips if Docker is down.',
  },
  MUST_CATCH: [...first, ...later],
  MUST_NOT_FLAG: [
    {
      id: 'noise-whitespace',
      text: 'Regeln:\n  1.  Gartenpflege ist wichtig.',
      ruleId: 'WHITESPACE_RULE',
      note: 'list double-space — noise',
    },
    {
      id: 'noise-brand-fit',
      text: "Das Fitnessstudio 'Fit & Gesund' hat ein Angebot.",
      ruleId: 'DE_CASE',
      note: 'brand in quotes',
    },
    {
      id: 'ok-ideal-adj',
      text: 'Für Familien mit Kindern ist das ideal.',
      ruleId: 'NOMEN_KLEIN',
      note: 'predicative adj FP',
    },
  ],
};

fs.writeFileSync(OUT, `${JSON.stringify(gt, null, 2)}\n`);
console.log(`Wrote ${OUT}`);
console.log(`MUST_CATCH first=${first.length} later=${later.length} total=${gt.MUST_CATCH.length}`);
