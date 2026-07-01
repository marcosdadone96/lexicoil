#!/usr/bin/env node
/**
 * Personal exam — per-part and overall vocabulary coverage transparency.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const Coverage = require(path.join(ROOT, 'js/engine/personalExamCoverage.js'));
require(path.join(ROOT, 'js/engine/targetUsage.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const words = ['Apfel', 'Banane', 'Kirsche', 'Dattel'];

const exam = {
  vocabPersonal: true,
  lesenParts: [
    {
      teil: 1,
      text: 'Heute kaufe ich einen Apfel und eine Banane im Markt.',
      questions: [{ id: '1', question: 'Was kauft er?', options: ['a) x'], correct: 'a' }],
    },
    {
      teil: 2,
      _fromPool: true,
      passages: [{ passageId: 'A', text: 'Standardtext ohne Vokabeln.' }],
      questions: [{ id: '7', question: 'Q?', options: ['a) x'], correct: 'a' }],
    },
  ],
  horenParts: [
    {
      teil: 2,
      _fromPool: true,
      segments: [{ transcript: 'Allgemeiner Hörtext.', questions: [{ id: '11', question: 'Q?', correct: 'R' }] }],
    },
    {
      teil: 3,
      segments: [{
        transcript: 'Die Kirsche ist rot und süß.',
        questions: [{ id: '16', question: 'Farbe?', correct: 'R' }],
      }],
    },
  ],
  _teilFromPool: [2],
};

const cov = Coverage.computePersonalExamCoverage(exam, words);
assert('overall found 3 words', cov.overall.found === 3);
assert('overall total 4', cov.overall.total === 4);
assert('overall used includes Apfel', cov.overall.words.includes('Apfel'));
assert('overall used includes Kirsche', cov.overall.words.includes('Kirsche'));
assert('overall missing includes Dattel', cov.overall.missing.includes('Dattel'));

assert('byPart has lesen T1 with 2 words', cov.byPart.some(
  (p) => p.module === 'lesen' && p.teil === 1 && p.count === 2 && p.used.includes('Apfel'),
));
assert('pool lesen T2 counts 0 words', cov.byPart.some(
  (p) => p.module === 'lesen' && p.teil === 2 && p.count === 0 && p.fromPool,
));
assert('pool horen T2 counts 0', cov.byPart.some(
  (p) => p.module === 'horen' && p.teil === 2 && p.count === 0,
));
assert('horen T3 has Kirsche', cov.byPart.some(
  (p) => p.module === 'horen' && p.teil === 3 && p.used.includes('Kirsche'),
));

exam._coverageByPart = cov.byPart;
exam._coverageOverall = cov.overall;

const allUsed = Coverage.formatPersonalCoverageMessage(
  { ...exam, _teilFromPool: [] },
  { overall: { found: 4, total: 4, words: words, missing: [] } },
);
assert('all-used message mentions 4 words', /all 4 of your words/.test(allUsed) && allUsed.includes('Apfel'));

const partial = Coverage.formatPersonalCoverageMessage(exam, cov);
assert('partial message shows X of N', /3 of 4 words/.test(partial));
assert('partial lists missing Dattel', partial.includes('Dattel'));
assert('pool note in partial message', /standard bank material/.test(partial));

const header = Coverage.formatCoverageHeader(cov.overall);
assert('header Vocabulary X/N', header === 'Vocabulary: 3/4 words integrated');

console.log('\nPersonal vocab coverage tests passed.');
