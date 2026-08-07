/**
 * A2 Lesen routing — no make-t3 / debate seeds B1.
 * Run: node scripts/lib/__tests__/a2-lesen-routing.test.mjs
 */
import assert from 'node:assert/strict';
import {
  usesB1LesenT3MakeT3,
  usesB1LesenT4DebateSeeds,
  skipB1LesenT3BlueprintStock,
} from '../a2LesenGeneration.mjs';
import { shouldSkipLesenT3Topic, preflightLesenT3Topic } from '../poolFillTeilLib.mjs';
import { preflightLesenT4Topic, shouldSkipLesenT4Topic } from '../lesenT4SeedStock.mjs';
import { resolveT4GenerationMolds } from '../lesenSubtypeRotation.mjs';
import { countCompatibleMolds } from '../topicMoldCompatibility.mjs';
import { checkLesenBatchQuality } from '../lesenBatchQuality.mjs';

assert.equal(usesB1LesenT3MakeT3('B1', 3), true);
assert.equal(usesB1LesenT3MakeT3('A2', 3), false);
assert.equal(usesB1LesenT4DebateSeeds('B1', 4), true);
assert.equal(usesB1LesenT4DebateSeeds('B2', 4), false);
assert.equal(usesB1LesenT4DebateSeeds('A2', 4), false);

assert.equal(
  shouldSkipLesenT3Topic('lesen', 3, 'Verkehr', 'T3 generator exhausted after 8 attempts', {
    args: { level: 'A2' },
  }),
  false,
);
assert.equal(preflightLesenT3Topic('Verkehr', { args: { level: 'A2' } }).generatable, true);

assert.equal(
  shouldSkipLesenT4Topic('lesen', 4, 'Verkehr', 'sin semilla usable', {
    args: { level: 'A2' },
  }),
  false,
);
assert.equal(preflightLesenT4Topic('Verkehr', { args: { level: 'A2' } }).generatable, true);

assert.equal(resolveT4GenerationMolds({ level: 'A2', topicTag: 'Verkehr' }), null);
assert.equal(countCompatibleMolds(3, 'Verkehr', { level: 'A2' }), 1);

const medientextBatch = {
  level: 'A2',
  passages: [{ id: 'p1', text: 'Die Stadt plant neue Buslinien. Viele Bürger diskutieren online.' }],
  questions: [
    {
      id: 'q1',
      type: 'multiple_choice',
      level: 'A2',
      options: ['a) ja', 'b) nein', 'c) vielleicht'],
      correctAnswer: 'a',
    },
  ],
};
const qA2 = checkLesenBatchQuality(medientextBatch, 1, { level: 'A2' });
assert.ok(!qA2.issues.some((i) => /primera persona|ich\/mir/i.test(i)));

console.log('a2-lesen-routing.test.mjs: OK');
