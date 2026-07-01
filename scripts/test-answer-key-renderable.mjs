#!/usr/bin/env node
/**
 * Unit tests for isAnswerKeyRenderable — matching optKey extraction.
 */
import path from 'node:path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  isAnswerKeyRenderable,
  getRenderableAnswerKeys,
  optKey,
} = require(path.join(ROOT, 'js/engine/validation/isAnswerKeyRenderable.js'));

function ok(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const matchingWithPrefixedOpts = {
  id: 'q1',
  type: 'matching',
  correct: 'B',
  options: ['A) Yoga am Morgen', 'B) Pilates im Studio', 'C) Schwimmen'],
  _keyOnlyMatch: true,
};

ok(
  'matching "B) ..." options + correct B => renderable',
  isAnswerKeyRenderable(matchingWithPrefixedOpts, null),
);

const keysPrefixed = getRenderableAnswerKeys(matchingWithPrefixedOpts, null);
ok('getRenderableAnswerKeys extracts bare keys from prefixed strings', keysPrefixed.join(',') === 'A,B,C');

const matchingZero = {
  id: 'q2',
  type: 'matching',
  correct: '0',
  options: ['A) Anzeige A', 'B) Anzeige B', '0) Keine Zuordnung'],
  _keyOnlyMatch: true,
};

ok(
  'matching correct 0 + "0) Keine Zuordnung" => renderable',
  isAnswerKeyRenderable(matchingZero, null),
);

ok(
  'matching correct Z not in options => not renderable',
  !isAnswerKeyRenderable(
    {
      id: 'q3',
      type: 'matching',
      correct: 'Z',
      options: ['A) foo', 'B) bar'],
      _keyOnlyMatch: true,
    },
    null,
  ),
);

const adsPart = {
  ads: [
    { key: 'A', title: 'Ad A', text: 'Text A' },
    { key: 'B', title: 'Ad B', text: 'Text B' },
  ],
};

ok(
  '_keyOnlyMatch with ads-injected { key: "0" } still renderable',
  isAnswerKeyRenderable({ id: 'q4', type: 'matching', correct: '0', options: [] }, adsPart),
);

const keysAds = getRenderableAnswerKeys(
  { id: 'q4', type: 'matching', correct: '0', options: [] },
  adsPart,
);
ok('_keyOnlyMatch ads inject includes 0', keysAds.includes('0'));

ok('optKey bare "A"', optKey('A') === 'A');
ok('optKey prefixed "B) Pilates"', optKey('B) Pilates im Studio') === 'B');
ok('optKey negative "0) Keine Zuordnung"', optKey('0) Keine Zuordnung') === '0');
ok('optKey object { key: "0" }', optKey({ key: '0' }) === '0');

console.log('\nAll answer-key renderable tests passed.\n');
