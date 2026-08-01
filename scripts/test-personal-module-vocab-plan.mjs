#!/usr/bin/env node
/**
 * Unit tests for personal module vocab planner (Phase B).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { searchBestCombination } = require(path.join(
  ROOT,
  'netlify/functions/lib/personalModuleVocabPlan.js',
));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const teils = [1, 2];
const perTeil = new Map([
  [
    1,
    [
      { id: 'a', covered: ['hotel', 'reise'], score: 2, topicRelaxed: false, servedCount: 1, topicSlug: 'reisen' },
      { id: 'b', covered: ['flug'], score: 1, topicRelaxed: false, servedCount: 0, topicSlug: 'reisen' },
    ],
  ],
  [
    2,
    [
      { id: 'c', covered: ['urlaub'], score: 1, topicRelaxed: false, servedCount: 0, topicSlug: 'freizeit' },
      { id: 'd', covered: ['hotel', 'strand'], score: 2, topicRelaxed: false, servedCount: 2, topicSlug: 'freizeit' },
    ],
  ],
]);

const best = searchBestCombination(teils, perTeil, 3);
assert('finds combo with union >= 3', best && best.unionSize >= 3);
assert('union includes hotel', best.unionWords.includes('hotel'));

const impossible = searchBestCombination(
  [1],
  new Map([[1, [{ id: 'x', covered: ['a'], score: 1, topicRelaxed: false, servedCount: 0, topicSlug: 't' }]]]),
  3,
);
assert('rejects when union < min', impossible === null);

console.log('\nAll personal-module-vocab-plan unit tests passed.');
