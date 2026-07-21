/**
 * vocabQuizUtils.test.mjs
 * Run: node scripts/lib/__tests__/vocabQuizUtils.test.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  validateQuizOptionsQuality,
  pickBalancedDistractors,
  repairQuizOptions,
  weightedPickQuizTargets,
  pickPhraseGapOptions,
  phraseGapOptionsSamePos,
  normPos,
} = require('../../../netlify/functions/lib/vocabQuizUtils.js');

let passed = 0;
let failed = 0;

function assert(desc, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertOk(desc, value) {
  if (value) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    failed++;
  }
}

const meta = [
  { word: 'laufen', type: 'verb', translation: 'to run', missCount: 3 },
  { word: 'rennen', type: 'verb', translation: 'to sprint', missCount: 1 },
  { word: 'gehen', type: 'verb', translation: 'to walk', missCount: 0 },
  { word: 'springen', type: 'verb', translation: 'to jump', missCount: 0 },
  { word: 'Haus', type: 'noun', translation: 'house', missCount: 0 },
  { word: 'Tisch', type: 'noun', translation: 'table', missCount: 2 },
  { word: 'Stuhl', type: 'noun', translation: 'chair', missCount: 0 },
];

console.log('validateQuizOptionsQuality');
assertOk('accepts 4 verbs', validateQuizOptionsQuality('laufen', ['laufen', 'rennen', 'gehen', 'springen'], meta));
assertOk('rejects lone verb among nouns', !validateQuizOptionsQuality('laufen', ['laufen', 'Haus', 'Tisch', 'Stuhl'], meta));

console.log('pickBalancedDistractors');
const dist = pickBalancedDistractors('laufen', meta, 3, ['laufen'], () => 0.1);
assertOk('picks verb distractors only', dist.every((w) => ['rennen', 'gehen', 'springen'].includes(w)));

console.log('repairQuizOptions');
const fixed = repairQuizOptions('laufen', ['laufen', 'Haus'], meta, () => 0.2);
assert('repair yields 4 options', fixed.length, 4);
assertOk('repair keeps target', fixed.some((w) => w.toLowerCase() === 'laufen'));
assertOk('repair prefers same POS', fixed.filter((w) => ['rennen', 'gehen', 'springen', 'laufen'].includes(w)).length >= 3);

console.log('weightedPickQuizTargets');
const targets = weightedPickQuizTargets(meta, 2, ['laufen'], () => 0.99);
assert('prefers explicit target first', targets[0], 'laufen');

console.log('pickPhraseGapOptions — verb gap');
const verbMeta = [
  { word: 'untergehen', type: 'verb', translation: 'to set (sun)' },
  { word: 'abnehmen', type: 'verb', translation: 'to lose weight' },
  { word: 'vorschlagen', type: 'verb', translation: 'to suggest' },
  { word: 'bereitstellen', type: 'verb', translation: 'to provide' },
  { word: 'Schüler', type: 'noun', translation: 'student' },
  { word: 'Umwelt', type: 'noun', translation: 'environment' },
];
const verbOpts = pickPhraseGapOptions('geht', 'untergehen', verbMeta, () => 0.5);
assertOk('verb gap yields 4 options', verbOpts.length === 4);
assertOk('verb gap all same POS', phraseGapOptionsSamePos('geht', 'untergehen', verbOpts, verbMeta));
assertOk('verb gap uses stems not lemmas', !verbOpts.some((o) => ['untergehen', 'abnehmen', 'vorschlagen'].includes(o)));
assertOk('verb gap excludes nouns', !verbOpts.some((o) => ['Schüler', 'Umwelt'].includes(o)));

console.log('pickPhraseGapOptions — noun gap');
const nounMeta = [
  { word: 'Schüler', type: 'noun', translation: 'student' },
  { word: 'Umwelt', type: 'noun', translation: 'environment' },
  { word: 'Mittag', type: 'noun', translation: 'noon' },
  { word: 'Tisch', type: 'noun', translation: 'table' },
  { word: 'abnehmen', type: 'verb', translation: 'to lose weight' },
  { word: 'vorschlagen', type: 'verb', translation: 'to suggest' },
];
const nounOpts = pickPhraseGapOptions('Umwelt', 'Umwelt', nounMeta, () => 0.5);
assertOk('noun gap yields 4 options', nounOpts.length === 4);
assertOk('noun gap all same POS', phraseGapOptionsSamePos('Umwelt', 'Umwelt', nounOpts, nounMeta));
assertOk('noun gap excludes verbs', !nounOpts.some((o) => ['abnehmen', 'vorschlagen'].includes(o)));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
