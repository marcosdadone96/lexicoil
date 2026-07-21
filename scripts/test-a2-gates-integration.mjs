#!/usr/bin/env node
/**
 * Integration test — A2 gates (length bias, B1+, surgical labels).
 *   node scripts/test-a2-gates-integration.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  collectMcqLengthBiasIssues,
  resolveLengthBiasThresholds,
  checkMcqQuestionLengthBias,
} from './lib/mcqLengthBias.mjs';
import { checkLexical } from './lib/lexicalCheck.mjs';
import { checkHorenBatchQuality } from './lib/horenBatchQuality.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { surgicalRepairLabel } from './lib/surgicalRepairRouter.mjs';

const BANK = path.join(ROOT, 'library/de/A2/questions.json');
const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));

console.log('── A2 length bias thresholds ──');
const a2t = resolveLengthBiasThresholds('A2');
const b1t = resolveLengthBiasThresholds('B1');
assert.equal(a2t.minChars, 8, 'A2 minChars=8');
assert.equal(b1t.minChars, 12, 'B1 minChars=12');
assert.equal(a2t.minPct, 20, 'A2 minPct=20');
console.log('OK  resolveLengthBiasThresholds A2 vs B1');

const marginalA2 = {
  id: 'marg-a2',
  type: 'multiple_choice',
  level: 'A2',
  correct: 'b',
  options: [
    'a) Kurze Antwort hier.',
    'b) Etwas längere Antwort hier.',
    'c) Auch kurze Antwort.',
  ],
};
const rMargB1 = checkMcqQuestionLengthBias(marginalA2, { gate: true, level: 'B1' });
const rMargA2 = checkMcqQuestionLengthBias(marginalA2, { gate: true, level: 'A2' });
console.log(`    marginal: B1 bad=${rMargB1.bad} A2 bad=${rMargA2.bad}`);

const severeA2 = {
  id: 'sev-a2',
  type: 'multiple_choice',
  level: 'A2',
  correct: 'a',
  options: [
    'a) Das ist eine deutlich längere richtige Antwort mit vielen Wörtern.',
    'b) Kurz.',
    'c) Auch kurz.',
  ],
};
assert.equal(checkMcqQuestionLengthBias(severeA2, { gate: true, level: 'A2' }).bad, true);
console.log('OK  severe bias fails under A2 threshold');

const realLesen = bank.questions.find(
  (q) => q.module === 'lesen' && q.teil === 1 && q.type === 'multiple_choice',
);
if (realLesen) {
  const batch = {
    level: 'A2',
    questions: [realLesen],
    passages: bank.passages.filter((p) => p.id === realLesen.passageId),
  };
  const a2Issues = collectMcqLengthBiasIssues(batch, { level: 'A2' });
  const b1Issues = collectMcqLengthBiasIssues(batch, { level: 'B1' });
  console.log(`OK  real lesen T1 MCQ: A2 gate issues=${a2Issues.length} B1=${b1Issues.length}`);
}

console.log('\n── B1+ lexical gate (A2) ──');
const lexBad = checkLexical({
  level: 'A2',
  passages: [{ id: 'p1', text: 'Anna geht ins Café.', title: 'Test' }],
  questions: [
    {
      id: 'q1',
      module: 'lesen',
      teil: 1,
      level: 'A2',
      type: 'multiple_choice',
      question: 'Was ist die Herausforderung?',
      options: ['a) Einfach', 'b) Schwer', 'c) Gut'],
      correct: 'a',
      explanation: 'Die Herausforderung ist groß.',
    },
  ],
});
assert.equal(lexBad.ok, false, 'B1+ term should fail');
assert.ok(
  lexBad.issues.some((i) => i.includes('B1+') && i.includes('(A2)')),
  `issues: ${lexBad.issues.join('; ')}`,
);
console.log('OK  checkLexical flags B1+ with (A2) suffix');

console.log('\n── surgicalRepairLabel by level ──');
assert.equal(surgicalRepairLabel('lexico', 'A2'), 'léxico B1+');
assert.equal(surgicalRepairLabel('lexico', 'B1'), 'léxico B2+');
assert.match(surgicalRepairLabel('mcq_length_bias', 'A2'), /A2/);
console.log('OK  surgical labels parametrized');

console.log('\n── A2 lesen/horen quality paths ──');
const lesenBatch = {
  level: 'A2',
  passages: bank.passages.filter((p) => p.module === 'lesen' && p.teil === 1).slice(0, 1),
  questions: bank.questions.filter((q) => q.module === 'lesen' && q.teil === 1).slice(0, 5),
};
if (lesenBatch.questions.length === 5) {
  const lq = checkLesenBatchQuality(lesenBatch, 1, { level: 'A2' });
  console.log(`OK  lesen T1 A2 quality: ok=${lq.ok} issues=${lq.issues.length}`);
}

const horenBatch = {
  level: 'A2',
  passages: bank.passages.filter((p) => p.module === 'horen' && p.teil === 1).slice(0, 2),
  questions: bank.questions.filter((q) => q.module === 'horen' && q.teil === 1).slice(0, 5),
};
if (horenBatch.questions.length >= 1) {
  const hq = checkHorenBatchQuality(horenBatch, 1, { level: 'A2' });
  console.log(`OK  horen T1 A2 quality path: ok=${hq.ok} issues=${hq.issues.length}`);
}

console.log('\nPASS: A2 gates integration');
