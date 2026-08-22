/**
 * cambridge-numbering.test.mjs
 * Regression, two bugs found running the app against en/B1:
 *
 *  a) horenQuestionHasSubstance() judged gap_fill by the MCQ rule (>=2 options).
 *     Cambridge Listening Part 3 sentence-completion items carry options:[], so
 *     all six were filtered out of every exam — the part rendered empty.
 *  b) ExamRenumber only knew the Goethe range table. Cambridge numbers Reading
 *     1-32 over six parts and Listening 1-25 over four, so English exams got
 *     gaps (5->7->13->20->27), a duplicate (Listening reused 16) and — Goethe
 *     having no Teil 6 — Reading Part 6 restarted at 1, colliding with Part 1.
 *
 * Goethe must keep the old table exactly.
 * Run:  node scripts/lib/__tests__/cambridge-numbering.test.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ExamRenumber = require(path.join(ROOT, 'js/engine/examRenumber.js'));

let passed = 0, failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

const range = (t) => `${t.start}-${t.end}`;

// ── b) range tables ────────────────────────────────────────────────────────
const goethe = ExamRenumber.DEFAULT_RANGES;
assert('Goethe Lesen table unchanged', range(goethe.lesen[1]) === '1-6' && range(goethe.lesen[5]) === '27-30');
assert('Goethe Hoeren table unchanged', range(goethe.horen[1]) === '1-10' && range(goethe.horen[4]) === '23-30');
assert('Goethe Lesen has no Teil 6', goethe.lesen[6] === undefined);

function numbersFor(exam) {
  ExamRenumber.renumberExam(exam, null);
  const out = {};
  for (const mod of ['lesen', 'horen']) {
    const ns = [];
    for (const p of exam[mod + 'Parts'] || []) {
      for (const q of p.questions || []) if (q.number != null) ns.push(q.number);
      for (const s of p.segments || []) for (const q of s.questions || []) if (q.number != null) ns.push(q.number);
    }
    out[mod] = ns;
  }
  return out;
}
const contiguous = (ns) => {
  if (!ns.length) return false;
  const sorted = [...ns].sort((a, b) => a - b);
  return sorted[0] === 1 && sorted.every((n, i) => n === i + 1);
};

// Cambridge B1: Reading 5/5/5/5/6/6 = 32, Listening 7/6/6/6 = 25.
const mkQs = (n, type = 'multiple_choice') =>
  Array.from({ length: n }, (_, i) => ({ type, question: 'q' + i, correct: 'A', options: ['a', 'b', 'c'] }));
const cambridge = {
  lang: 'en', level: 'B1', blueprintId: 'cambridge-b1',
  lesenParts: [5, 5, 5, 5, 6, 6].map((n, i) => ({ teil: i + 1, questions: mkQs(n) })),
  horenParts: [7, 6, 6, 6].map((n, i) => ({ teil: i + 1, questions: mkQs(n) })),
};
const cam = numbersFor(cambridge);
assert('Cambridge Reading numbered 1-32 with no gap or repeat', cam.lesen.length === 32 && contiguous(cam.lesen));
assert('Cambridge Listening numbered 1-25 with no gap or repeat', cam.horen.length === 25 && contiguous(cam.horen));

// Goethe B1: Reading 6/6/7/7/4 = 30, Listening 10/5/7/8 = 30.
const goetheExam = {
  lang: 'de', level: 'B1',
  lesenParts: [6, 6, 7, 7, 4].map((n, i) => ({ teil: i + 1, questions: mkQs(n) })),
  horenParts: [10, 5, 7, 8].map((n, i) => ({ teil: i + 1, questions: mkQs(n) })),
};
const goe = numbersFor(goetheExam);
assert('Goethe Reading still 1-30 contiguous', goe.lesen.length === 30 && contiguous(goe.lesen));
assert('Goethe Listening still 1-30 contiguous', goe.horen.length === 30 && contiguous(goe.horen));

// A German exam without blueprintId must not be routed to the Cambridge table.
const noBp = { lang: 'de', level: 'B1', horenParts: [{ teil: 1, questions: mkQs(10) }] };
assert('German without blueprintId keeps Goethe start', numbersFor(noBp).horen.length === 10);

console.log(`\ncambridge numbering: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
