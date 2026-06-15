#!/usr/bin/env node
/**
 * Quick tests for blueprintConformance.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkQuestionConformance } from './lib/blueprintConformance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const blueprint = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B1.json'), 'utf8'),
);

const matchingNoOpts = {
  id: 'test-h4-match-no-opts',
  module: 'horen',
  teil: 4,
  type: 'matching',
  question: 'Wer sagt das?',
  correct: 'A',
  options: [],
};

const r1 = checkQuestionConformance(matchingNoOpts, blueprint);
assert(
  'Hören T4 matching sin options → matching_missing_options',
  !r1.ok && r1.reasons.includes('matching_missing_options'),
);

const gapFillT4 = {
  id: 'note1-test',
  module: 'horen',
  teil: 4,
  type: 'gap_fill',
  question: 'Farbe der Tonne:',
  correct: 'orange',
  options: [],
};

const r2 = checkQuestionConformance(gapFillT4, blueprint);
assert(
  'Hören T4 gap_fill → type_not_allowed',
  !r2.ok && r2.reasons.some((x) => x.startsWith('type_not_allowed:gap_fill')),
);

const matchingOk = {
  id: 'test-h4-match-ok',
  module: 'horen',
  teil: 4,
  type: 'matching',
  question: 'Wer sagt das?',
  correct: 'A',
  options: ['A', 'B', 'M'],
};

const r3 = checkQuestionConformance(matchingOk, blueprint);
assert('Hören T4 matching con 3 options → pasa', r3.ok && r3.reasons.length === 0);

console.log('\nAll blueprint conformance tests passed.\n');
