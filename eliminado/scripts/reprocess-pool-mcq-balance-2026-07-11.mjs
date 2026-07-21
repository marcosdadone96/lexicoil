/**
 * Reprocess pool-verified MCQ letter balance (BALANCE_MCQ_VERSION v1.1).
 * Runs the same question pipeline slice as normalizeBatch (balance + antiRuns +
 * keyed shuffle) without re-running caps/markdown.
 *
 *   node scripts/reprocess-pool-mcq-balance-2026-07-11.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  balanceMcqGroup,
  antiRuns,
  derivePartShuffleSeed,
  shuffleKeyedQuestionOrder,
  BALANCE_MCQ_VERSION,
  answerKeySequence,
} from './lib/balanceMcq.mjs';

const DIR = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/pool-mcq-balance-reprocess-2026-07-11.json',
);

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const changed = [];
const stampOnly = [];

for (const file of files) {
  const abs = path.join(DIR, file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const beforeKey = answerKeySequence(batch.questions || [], 'multiple_choice');
  const rawQuestions = (batch.questions || []).map((q) => ({ ...q }));
  const seed = derivePartShuffleSeed(rawQuestions);
  const nextQuestions = shuffleKeyedQuestionOrder(
    antiRuns(balanceMcqGroup(rawQuestions, { seed })),
    { seed },
  );
  const afterKey = answerKeySequence(nextQuestions, 'multiple_choice');
  const next = {
    ...batch,
    questions: nextQuestions,
    _balanceMcqVersion: BALANCE_MCQ_VERSION,
    _balanceMcqNormalizedAt: new Date().toISOString(),
  };
  const contentChanged = beforeKey !== afterKey;
  if (contentChanged) {
    changed.push({
      file,
      beforeKey,
      afterKey,
      mcqCount: (nextQuestions || []).filter((q) => q.type === 'multiple_choice').length,
    });
  } else {
    stampOnly.push(file);
  }
  fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

const report = {
  generatedAt: new Date().toISOString(),
  version: BALANCE_MCQ_VERSION,
  total: files.length,
  contentChanged: changed.length,
  stampOnly: stampOnly.length,
  changedFiles: changed,
};

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  version: report.version,
  total: report.total,
  contentChanged: report.contentChanged,
  stampOnly: report.stampOnly,
  sample: changed.slice(0, 15),
}, null, 2));
console.log(`\nWrote ${OUT}`);
