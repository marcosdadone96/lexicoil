#!/usr/bin/env node
/**
 * B1 Fase 2 client contract — text decision + partial warning helpers (§9.1).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { planDecisionFromText } = require(path.join(
  ROOT,
  'netlify/functions/lib/personalModuleVocabPlan.js',
));
const PersonalExamCoverage = require(path.join(ROOT, 'js/engine/personalExamCoverage.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

assert('serve_now at 3', planDecisionFromText(3, 3) === 'serve_now');
assert('serve_partial at 2', planDecisionFromText(2, 3) === 'serve_partial');
assert('serve_partial at 1', planDecisionFromText(1, 3) === 'serve_partial');
assert('reject at 0', planDecisionFromText(0, 3) === 'reject');

const dePartial = PersonalExamCoverage.formatPersonalPartialWarning(
  { found: 2, words: ['Hotel', 'Reise'] },
  3,
  'de',
);
assert('partial DE mentions 2', dePartial.includes('2') && dePartial.includes('Hotel'));

const enPartial = PersonalExamCoverage.formatPersonalPartialWarning(
  { found: 1, words: ['work'] },
  3,
  'en',
);
assert('partial EN mentions integrate', enPartial.toLowerCase().includes('integrate'));

console.log('\nB1 Phase 2 decision / partial UI helper tests passed.');
