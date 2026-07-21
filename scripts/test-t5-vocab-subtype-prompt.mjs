#!/usr/bin/env node
/**
 * Verifica que T5×freizeitzentrum usa palabras remapeadas en el prompt final
 * y no las originales marke/supermarkt.
 */
import assert from 'node:assert/strict';
import { buildLesenPrompt } from './lib/lesenTemplatePrompt.mjs';
import { adaptT5WordsForSubtype } from './lib/lesenT5SubtypeVocab.mjs';
import { LESEN_T5_SUBTYPES } from './lib/lesenSubtypeRotation.mjs';
import { buildVocabPreferenceBlock } from './lib/userVocabPrompt.mjs';

const originalWords = [
  'marke',
  'supermarkt',
  'aufgabe',
  'situation',
  'aktuell',
  'betreffen',
  'nachbar',
  'nachhaltigkeit',
  'urlaub',
  'hobby',
];

const subtypeDef = LESEN_T5_SUBTYPES.find((s) => s.id === 'freizeitzentrum');
const adapted = adaptT5WordsForSubtype(originalWords, 'Konsum', 'freizeitzentrum');

assert.ok(adapted.swapped.some((s) => s.startsWith('marke→')), 'marke remapped');
assert.ok(adapted.swapped.some((s) => s.startsWith('supermarkt→')), 'supermarkt remapped');
assert.ok(!adapted.words.includes('marke'), 'marke not in adapted list');
assert.ok(!adapted.words.includes('supermarkt'), 'supermarkt not in adapted list');
assert.ok(adapted.words.includes('anmeldung'), 'anmeldung in adapted list');
assert.ok(adapted.words.includes('gebühr'), 'gebühr in adapted list');

const prompt = buildLesenPrompt(5, adapted.words, {
  topic: 'Konsum',
  textSubtype: 'freizeitzentrum',
  subtypeDef,
  level: 'B1',
  idSuffix: 'test1234',
});

const vocabBlock = buildVocabPreferenceBlock(adapted.words);
assert.match(prompt, /anmeldung/, 'prompt contains anmeldung');
assert.match(prompt, /gebühr/, 'prompt contains gebühr');
assert.doesNotMatch(prompt, /\bmarke\b/i, 'prompt must not contain marke');
assert.doesNotMatch(prompt, /\bsupermarkt\b/i, 'prompt must not contain supermarkt');
assert.ok(prompt.includes(vocabBlock.slice(0, 40)), 'prompt includes vocab preference block from adapted words');

console.log('OK  test-t5-vocab-subtype-prompt.mjs');
console.log(`  adapted: ${adapted.words.slice(0, 6).join(', ')}…`);
console.log(`  swaps: ${adapted.swapped.join(', ')}`);
