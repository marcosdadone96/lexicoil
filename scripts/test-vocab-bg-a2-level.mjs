#!/usr/bin/env node
/**
 * vocab-bg A2 level propagation — simulation only (no Gemini / generate-cli).
 *   node scripts/test-vocab-bg-a2-level.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { planVocabBgGeneration } from './lib/planVocabBgGeneration.mjs';
import { bgModulesForLevel, moduleTeilsForLevel, smokeCellsForLevel } from './lib/levelPlanner.mjs';
import { loadPoolRecords } from './lib/poolGapPlanner.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VocabBgState = require(path.join(ROOT, 'netlify/functions/lib/vocabBgState.js'));

const a2Pending = [
  { word: 'termin', sourceLang: 'de', sourceLevel: 'A2', savedAt: Date.now() },
  { word: 'arzt', sourceLang: 'de', sourceLevel: 'A2', savedAt: Date.now() + 1 },
  { word: 'bahn', sourceLang: 'de', sourceLevel: 'A2', savedAt: Date.now() + 2 },
  { word: 'einkaufen', sourceLang: 'de', sourceLevel: 'A2', savedAt: Date.now() + 3 },
];

assert.equal(VocabBgState.resolveBgLevelFromPending(a2Pending), 'A2');
assert.equal(VocabBgState.resolveBgLevelFromPending([], 'B1'), 'B1');

const mixed = [
  ...a2Pending,
  { word: 'fitness', sourceLang: 'de', sourceLevel: 'B1', savedAt: Date.now() + 4 },
];
assert.equal(VocabBgState.resolveBgLevelFromPending(mixed), 'A2');

const a2Lesen = moduleTeilsForLevel('lesen', 'A2');
const b1Lesen = moduleTeilsForLevel('lesen', 'B1');
assert.ok(!a2Lesen.includes(5), 'A2 lesen has no T5');
assert.ok(b1Lesen.includes(5), 'B1 lesen has T5');

const a2Schreiben = moduleTeilsForLevel('schreiben', 'A2');
assert.deepEqual(a2Schreiben, [1, 2], 'A2 schreiben only T1-T2');

const smokeA2 = smokeCellsForLevel('A2');
assert.equal(smokeA2.length, 13, 'A2 smoke = 13 official cells');
assert.ok(!smokeA2.some((c) => c.module === 'lesen' && c.teil === 5));
assert.ok(!smokeA2.some((c) => c.module === 'schreiben' && c.teil === 3));

const a2Records = loadPoolRecords('de', 'A2');
assert.ok(a2Records.length > 0, 'A2 seed records load');

const plan = planVocabBgGeneration({
  pendingWords: a2Pending,
  preferredModule: 'horen',
  lang: 'de',
  level: 'A2',
});

assert.equal(plan.level, 'A2');
assert.ok(moduleTeilsForLevel(plan.module, 'A2').includes(plan.teil), `teil ${plan.teil} valid for ${plan.module} A2`);
assert.ok(plan.words.length >= 2);
assert.ok((plan.userAnchor?.length || 0) >= 2);

const bgModules = bgModulesForLevel('A2');
assert.deepEqual(Object.keys(bgModules).sort(), ['horen', 'lesen']);

console.log('OK  test-vocab-bg-a2-level.mjs');
console.log(JSON.stringify({
  resolveLevel: 'A2',
  plan: { module: plan.module, teil: plan.teil, topic: plan.topic, level: plan.level, words: plan.words.length },
  smokeA2Cells: smokeA2.length,
  a2SeedRecords: a2Records.length,
}, null, 2));
