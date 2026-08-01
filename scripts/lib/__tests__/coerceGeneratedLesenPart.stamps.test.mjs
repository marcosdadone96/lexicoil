#!/usr/bin/env node
/**
 * coerceGeneratedLesenPart must preserve normalizeBatch stamps (_balanceMcqVersion, …).
 *   node scripts/lib/__tests__/coerceGeneratedLesenPart.stamps.test.mjs
 */
import assert from 'node:assert/strict';
import { coerceGeneratedLesenPart } from '../normalizeBatch.mjs';
import { BALANCE_MCQ_VERSION } from '../balanceMcq.mjs';

const raw = {
  passages: [{ id: 'p1', text: 'Liebe Anna,\n\nich war krank. Ich gehe jetzt spazieren.\n\nGrüße\nLena', title: 'Mail' }],
  questions: [
    {
      id: 'q1',
      type: 'multiple_choice',
      question: 'Warum schreibt Lena?',
      options: ['a) Sie ist krank', 'b) Sie lädt ein', 'c) Sie fragt nach Medikamenten'],
      correct: 'a',
      correctAnswer: 'a',
      explanation: 'Lena erzählt von ihrer Krankheit.',
    },
    {
      id: 'q2',
      type: 'multiple_choice',
      question: 'Wie geht es Lena jetzt?',
      options: ['a) Schlecht', 'b) Besser', 'c) Sie arbeitet viel'],
      correct: 'b',
      correctAnswer: 'b',
      explanation: 'Sie schreibt, dass es besser geht.',
    },
    {
      id: 'q3',
      type: 'multiple_choice',
      question: 'Was möchte Lena machen?',
      options: ['a) Ins Krankenhaus', 'b) Spazieren gehen', 'c) Schlafen'],
      correct: 'b',
      correctAnswer: 'b',
      explanation: 'Sie schlägt einen Spaziergang vor.',
    },
  ],
};

const out = coerceGeneratedLesenPart(raw, { teil: 3, lang: 'de', level: 'A2' });

assert.equal(out._balanceMcqVersion, BALANCE_MCQ_VERSION, 'must keep _balanceMcqVersion');
assert.ok(out._balanceMcqNormalizedAt, 'must keep _balanceMcqNormalizedAt');
assert.equal(out.passages.length, 1);
assert.equal(out.questions.length, 3);
assert.equal(out.questions[0].module, 'lesen');
assert.equal(out.questions[0].teil, 3);

console.log('PASS: coerceGeneratedLesenPart preserves balanceMcq stamps');
