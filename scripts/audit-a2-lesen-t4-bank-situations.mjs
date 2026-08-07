#!/usr/bin/env node
/**
 * Auditoría Lesen T4 matching en library/de/A2/questions.json (todas las celdas, no solo pool).
 *   node scripts/audit-a2-lesen-t4-bank-situations.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  isGenericLesenA2T4QuestionStem,
  hasLesenA2T4PersonSituation,
} from './lib/lesenA2T4Situations.mjs';

const bankPath = path.join(ROOT, 'library/de/A2/questions.json');
const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));

const t4 = (bank.questions || []).filter(
  (q) => q.module === 'lesen' && Number(q.teil) === 4 && q.type === 'matching',
);

const sets = new Map();
for (const q of t4) {
  const m = String(q.id).match(/^de-a2-l-t4-(.+)-q\d+$/);
  const setId = m ? m[1] : 'unknown';
  if (!sets.has(setId)) sets.set(setId, { total: 0, generic: 0, ids: [] });
  const row = sets.get(setId);
  row.total += 1;
  const generic = isGenericLesenA2T4QuestionStem(q.question);
  if (generic) {
    row.generic += 1;
    row.ids.push(q.id);
  }
}

const genericAll = t4.filter((q) => isGenericLesenA2T4QuestionStem(q.question));

const report = {
  at: new Date().toISOString(),
  bankPath: bankPath.replace(/\\/g, '/'),
  lesenT4MatchingTotal: t4.length,
  distinctSets: sets.size,
  setIds: [...sets.keys()].sort(),
  /** Sets beyond the 4 pool files (8 sets total, 4 in pool-verified) */
  setsNotInPoolVerified: [...sets.keys()].filter(
    (s) =>
      ![
        'vegetarismus-schule-02',
        'pfand-erhoehung-02',
        'vier-tage-woche-02',
        'kostenlos-museum-01',
      ].includes(s),
  ),
  genericQuestionCount: genericAll.length,
  genericQuestions: genericAll.map((q) => ({
    id: q.id,
    correct: q.correct || q.correctAnswer,
    personSitu: hasLesenA2T4PersonSituation(q.question),
    preview: String(q.question || '').slice(0, 100),
  })),
  bySet: Object.fromEntries(
    [...sets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, v]),
  ),
  pass: genericAll.length === 0,
};

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-lesen-t4-bank-situation-audit.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
