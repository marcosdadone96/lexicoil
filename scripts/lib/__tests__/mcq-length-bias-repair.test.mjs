#!/usr/bin/env node
/**
 * mcq-length-bias-repair.test.mjs — patch apply logic (no LLM)
 */
import assert from 'node:assert/strict';
import { failsLengthBiasGate } from '../mcqLengthBiasRepair.mjs';
import { measureMcqQuestionLengthBias } from '../mcqLengthBias.mjs';

// Hören-style q4: +42% length bias (operator incident)
const qBiased = {
  id: 'gen-q-h2-test-q4',
  type: 'multiple_choice',
  correct: 'c',
  correctAnswer: 'c',
  passageId: 'gen-p-h2-test',
  options: [
    'a) Kurze Antwort mit neunundzwanzig Zeichen hier.',
    'b) Etwas längere falsche Antwort mit dreiunddreißig Zeichen.',
    'c) Die richtige Antwort ist deutlich länger als beide anderen Distraktoren und hat viele zusätzliche Details zum Thema.',
  ],
};

assert.equal(failsLengthBiasGate(qBiased), true);
const before = measureMcqQuestionLengthBias(qBiased);
assert.ok(before.diffPct >= 20, `expected significant bias, got ${before.diffPct}%`);

// Simulate LLM patch: shorten correct, lengthen distractors (partial improvement)
const patched = {
  ...qBiased,
  options: [
    'a) Kurze Antwort mit neunundzwanzig Zeichen hier und etwas mehr Kontext.',
    'b) Etwas längere falsche Antwort mit dreiunddreißig Zeichen und Zusatzinfo.',
    'c) Die richtige Antwort ist jetzt kürzer aber noch korrekt.',
  ],
};

// Old bug: would reject patch if still biased — new code applies if options changed
const changed =
  patched.options[2] !== qBiased.options[2] ||
  patched.options[0] !== qBiased.options[0];
assert.ok(changed, 'patch should differ from original');

const after = measureMcqQuestionLengthBias(patched);
assert.ok(
  after.diffPct < before.diffPct || !after.isLongest,
  `patch should improve bias: ${before.diffPct}% → ${after.diffPct}%`,
);

console.log('mcq-length-bias-repair.test.mjs: OK');
