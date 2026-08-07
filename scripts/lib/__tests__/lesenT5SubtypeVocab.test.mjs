#!/usr/bin/env node
/**
 * Lesen T5 subtype vocab — prompt words + circuit ratio.
 * Run: node scripts/lib/__tests__/lesenT5SubtypeVocab.test.mjs
 */
import assert from 'node:assert/strict';
import {
  resolveT5PromptWords,
  checkT5VocabIntegration,
  T5_PROMPT_WORD_CAP,
} from '../lesenT5SubtypeVocab.mjs';
import { vocabRatioFromBatch } from '../topicMoldCircuitBreaker.mjs';
import { VOCAB_FIT_TRIP_THRESHOLD } from '../topicMoldCircuitBreaker.mjs';

const sportWords = resolveT5PromptWords('sportverein', {
  count: 6,
  userWords: [
    'betreffen',
    'spaziergang',
    'urlaub',
    'nachhaltigkeit',
    'nachbar',
    'täglich',
  ],
  topic: 'Freizeit',
  cursor: 0,
});

assert.equal(sportWords.length, 6);
assert.ok(sportWords.includes('anmeldung'), `expected anmeldung in ${sportWords.join(',')}`);
assert.ok(!sportWords.includes('urlaub'), 'urlaub should not stay in sportverein prompt');
assert.ok(!sportWords.includes('spaziergang'), 'spaziergang should not stay');

const batchOk = {
  teil: 5,
  topicTag: 'Freizeit',
  userVocabFeedback: {
    requested: sportWords,
    prompted: sportWords,
    used: sportWords.slice(0, 3),
    notUsed: sportWords.slice(3),
    ratio: 0.5,
  },
};
const gate = checkT5VocabIntegration(batchOk);
assert.equal(gate.ok, true, '3/6 satisfies min 2');

const ratioCircuit = vocabRatioFromBatch(batchOk, { teil: 5 });
assert.ok(ratioCircuit >= VOCAB_FIT_TRIP_THRESHOLD, 'circuit treats min-hit T5 as not low-vocab');

const batchLow = {
  teil: 5,
  topicTag: 'Freizeit',
  userVocabFeedback: {
    requested: sportWords,
    used: ['anmeldung'],
    notUsed: sportWords.slice(1),
    ratio: 1 / 6,
  },
};
assert.equal(checkT5VocabIntegration(batchLow).ok, false);
assert.ok(vocabRatioFromBatch(batchLow, { teil: 5 }) < VOCAB_FIT_TRIP_THRESHOLD);

assert.equal(T5_PROMPT_WORD_CAP, 6);

console.log('OK lesenT5SubtypeVocab.test.mjs');
console.log(`  sportverein prompt: ${sportWords.join(', ')}`);
