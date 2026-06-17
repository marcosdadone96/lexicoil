#!/usr/bin/env node
/**
 * Assert staging mapQuestion/partRecord output matches library question-bank schema keys.
 * Usage: node scripts/test-staging-bank-schema.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  mapQuestion,
  partRecord,
  schemaMatchesBank,
  BANK_QUESTION_KEYS,
  BANK_PASSAGE_KEYS,
} = require(path.join(ROOT, 'netlify/functions/lib/stagingFromExam.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

function sortedKeys(obj) {
  return Object.keys(obj).sort();
}

function keysMatch(a, b, label) {
  const sa = sortedKeys(a);
  const sb = sortedKeys(b);
  assert(sa.length === sb.length && sa.every((k, i) => k === sb[i]), `${label}: ${sa.join(', ')} === ${sb.join(', ')}`);
}

const bankPath = path.join(ROOT, 'library/de/B1/questions.json');
const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));

const bankQuestion = bank.questions.find((q) => q.language && q.examType && q.questionType);
const bankPassage = bank.passages.find((p) => p.teil != null && (p.passageVocab || []).length > 0);

assert(bankQuestion, 'bank has a canonical question sample');
assert(bankPassage, 'bank has a canonical passage sample');

const expectedQuestionKeys = [...BANK_QUESTION_KEYS].sort();
const expectedPassageKeys = [...BANK_PASSAGE_KEYS].sort();

assert(
  sortedKeys(Object.fromEntries(expectedQuestionKeys.map((k) => [k, null]))).join() === expectedQuestionKeys.join(),
  'BANK_QUESTION_KEYS matches reference schema',
);

const mockPart = {
  teil: 1,
  textTitle: 'Stadtgarten Test',
  text: bankPassage.text,
  questions: [
    {
      question: bankQuestion.question,
      correct: bankQuestion.correct,
      type: bankQuestion.type,
      options: bankQuestion.options,
      explanation: bankQuestion.explanation,
    },
    { question: 'Stadtgärten werden beliebter.', correct: 'Richtig', type: 'richtig_falsch' },
  ],
};

const record = partRecord('lesen', mockPart, {
  lang: 'de',
  level: 'B1',
  source: 'test',
  batchId: 'schema-test',
});

assert(record, 'partRecord returns a staging record');
assert(record.passage, 'partRecord includes passage');

for (const q of record.questions) {
  keysMatch(q, Object.fromEntries(expectedQuestionKeys.map((k) => [k, q[k]])), 'mapped question keys');
  assert(q.language === 'de', 'question.language === de');
  assert(q.examType === 'goethe', 'question.examType === goethe');
  assert(q.correct === q.correctAnswer, 'correct/correctAnswer mirrored');
}

keysMatch(record.passage, Object.fromEntries(expectedPassageKeys.map((k) => [k, record.passage[k]])), 'mapped passage keys');
assert(Array.isArray(record.passage.passageVocab) && record.passage.passageVocab.length >= 3, 'passageVocab derived');
assert(record.passage.teil === 1, 'passage.teil set');

const mappedSingle = mapQuestion({ question: 'Test?', type: 'multiple', correct: 'a' }, 'de', 'B1', 'lesen', 2, 'p-test');
const normalized = schemaMatchesBank({
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 2,
  questions: [mappedSingle],
  passage: null,
});
keysMatch(normalized.questions[0], Object.fromEntries(expectedQuestionKeys.map((k) => [k, normalized.questions[0][k]])), 'schemaMatchesBank question keys');
assert(!('lang' in normalized.questions[0]), 'bank question schema excludes internal lang');

console.log('\nAll staging bank-schema tests passed.');
