#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  pickFromLocalSeed,
  countLocalSeedByTeil,
} = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsLocalSeed.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const lesenCounts = countLocalSeedByTeil('de', 'B1', 'lesen');
const horenCounts = countLocalSeedByTeil('de', 'B1', 'horen');

assert('local seed has lesen T2', (lesenCounts[2] || 0) > 0);
assert('local seed has horen T1', (horenCounts[1] || 0) > 0);

const t2 = pickFromLocalSeed('de', 'B1', 'lesen', { teil: 2 });
assert('pick lesen T2', !!t2?.part);
assert('T2 has 2 passages', (t2.part.passage?.passages?.length || 0) >= 2);
assert('T2 has 6 questions', (t2.part.questions?.length || 0) === 6);

const h1 = pickFromLocalSeed('de', 'B1', 'horen', { teil: 1 });
assert('pick horen T1', !!h1?.part);

console.log('\nlocal-seed tests passed.');
