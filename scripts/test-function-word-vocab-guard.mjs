#!/usr/bin/env node
/**
 * Unit tests: function-word guard (layers A–D client logic).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/data/functionWords.js'));
const ManualVocab = require(path.join(ROOT, 'js/data/manualVocab.js'));

globalThis.S = {
  flashcards: [
    { word: 'und', type: 'verb', pos: 'verb', sourceLang: 'de' },
    { word: 'oder', type: 'verb', pos: 'verb', sourceLang: 'de' },
    { word: 'mit', type: 'noun', pos: 'noun', sourceLang: 'de' },
    { word: 'planen', type: 'verb', pos: 'verb', sourceLang: 'de' },
  ],
};

function pos(word, storedType) {
  return ManualVocab.inferPos({ word, type: storedType, pos: storedType, sourceLang: 'de' }, 'de');
}

console.log('\n=== test-function-word-vocab-guard ===\n');

assert.equal(ManualVocab.isFunctionWord('und'), true);
assert.equal(ManualVocab.isFunctionWord('Oder'), true);
assert.equal(ManualVocab.isFunctionWord('planen'), false);
console.log('OK  isFunctionWord');

assert.equal(pos('und', 'verb'), 'other');
assert.equal(pos('oder', 'verb'), 'other');
assert.equal(pos('mit', 'noun'), 'other');
assert.equal(pos('aber', 'verb'), 'other');
assert.equal(pos('planen', 'verb'), 'verb');
console.log('OK  inferPos overrides poisoned stored type');

const applied = ManualVocab.applyInferredPos({ word: 'und', type: 'verb', pos: 'verb' }, 'und', 'de');
assert.equal(applied.type, 'other');
assert.equal(applied.pos, 'other');
console.log('OK  applyInferredPos');

const before = globalThis.S.flashcards.length;
const dirty = ManualVocab.reclassifyStoredFlashcards();
assert.equal(dirty, true);
assert.equal(globalThis.S.flashcards.length, 1);
assert.equal(globalThis.S.flashcards[0].word, 'planen');
console.log(`OK  reclassifyStoredFlashcards removed ${before - 1} function words`);

(async () => {
  const vUnd = await ManualVocab.validate('und', 'de', 'A2', 'en');
  assert.equal(vUnd.ok, false);
  assert.equal(vUnd.reason, 'function_word');
  const vMit = await ManualVocab.validate('mit', 'de', 'A2', 'en');
  assert.equal(vMit.reason, 'function_word');
  console.log('OK  validate rejects function words');
  console.log('\nAll passed.\n');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
