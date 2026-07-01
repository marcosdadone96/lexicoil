#!/usr/bin/env node
/**
 * Unit tests for results.js ansLabel / correctLabel on matching items.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  optKey,
  normalizeGradingToken,
  isAnswerKeyRenderable,
  getRenderableAnswerKeys,
} = require(path.join(ROOT, 'js/engine/validation/isAnswerKeyRenderable.js'));

function loadResultsAnsLabel() {
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/results.js'), 'utf8');
  const end = src.indexOf('function countSpeakExchanges');
  const block = src.slice(0, end);
  const sandbox = {
    console,
    IsAnswerKeyRenderable: { optKey, normalizeGradingToken, isAnswerKeyRenderable, getRenderableAnswerKeys },
  };
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);
  return {
    ansLabel: sandbox.ansLabel,
    correctLabel: sandbox.correctLabel,
    enrichMatchingQFromPart: sandbox.enrichMatchingQFromPart,
  };
}

function loadLesenItemToAnswerQ() {
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examRunner.js'), 'utf8');
  const start = src.indexOf('function isLesenForumOpinionsPart');
  const end = src.indexOf('function isLesenAdsMatchingRender');
  const block = src.slice(start, end);
  const sandbox = {
    console,
    IsAnswerKeyRenderable: { optKey, normalizeGradingToken, isAnswerKeyRenderable, getRenderableAnswerKeys },
  };
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);
  return sandbox.lesenItemToAnswerQ;
}

const { ansLabel, correctLabel, enrichMatchingQFromPart } = loadResultsAnsLabel();
const lesenItemToAnswerQ = loadLesenItemToAnswerQ();

function goetheAnswersMatch(user, correct) {
  if (correct == null) return false;
  const u = String(user ?? '').trim().toLowerCase();
  const c = String(correct ?? '').trim().toLowerCase();
  return u === c;
}

// B1 Lesen T3 — bare letter options, type matching
const b1Item = {
  id: 'q1',
  type: 'matching',
  question: 'Person wants gym',
  options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', '0'],
  correct: 'C',
};
const b1Part = {
  teil: 3,
  ads: [
    { key: 'A', title: 'Yoga Studio', text: '...' },
    { key: 'B', title: 'Schwimmbad', text: '...' },
    { key: 'C', title: 'Krafttraining', text: '...' },
    { key: 'D', title: 'Laufclub', text: '...' },
  ],
};
const b1Q = lesenItemToAnswerQ(b1Item, b1Part, null, 0);
enrichMatchingQFromPart(b1Q, b1Part);

assert.equal(ansLabel(b1Q, 'D', true), 'D — Laufclub', 'wrong answer shows letter + ad title');
assert.equal(correctLabel(b1Q, true), 'C — Krafttraining', 'correct shows letter + ad title');
assert.equal(ansLabel(b1Q, 'C', true), 'C — Krafttraining', 'matching C is not Richtig/Falsch');
assert.notEqual(ansLabel(b1Q, 'D', true), 'Falsch', 'letter D must not become Falsch');
assert.equal(goetheAnswersMatch('D', 'C'), false, 'wrong letter scored incorrect');
assert.equal(goetheAnswersMatch('C', 'C'), true, 'correct letter scored correct');

// A2 Lesen T4 — lowercase correct key
const a2Item = {
  id: '16',
  type: 'matching',
  question: 'Welche Anzeige passt?',
  options: ['a) a', 'b) b', 'c) c', 'd) d', 'e) e', 'f) f', 'g) X'],
  correct: 'a',
};
const a2Part = {
  teil: 4,
  ads: [
    { key: 'a', title: 'Vegetarisches Mittagessen', text: 'Bio-Schulcafé...' },
    { key: 'b', title: 'Sportverein', text: '...' },
  ],
};
const a2Q = lesenItemToAnswerQ(a2Item, a2Part, null, 0);
enrichMatchingQFromPart(a2Q, a2Part);

assert.equal(correctLabel(a2Q, true), 'A — Vegetarisches Mittagessen', 'A2 lowercase correct → label');
assert.equal(ansLabel(a2Q, 'd', true), 'D', 'user lowercase d shows as D');
assert.equal(goetheAnswersMatch('a', 'a'), true, 'A2 lowercase match ok');
assert.equal(goetheAnswersMatch('d', 'a'), false, 'A2 wrong letter fail');

// RF type still shows Richtig/Falsch
const rfQ = { type: 'rf', correct: 'R', options: [] };
assert.equal(ansLabel(rfQ, 'R', true), 'Richtig');
assert.equal(ansLabel(rfQ, 'F', true), 'Falsch');

console.log('OK   test-results-matching-label');
