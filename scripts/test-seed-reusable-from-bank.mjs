#!/usr/bin/env node
/**
 * Bank reusable parts — excludes curated exam content, accepts bank-only Teile.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/library/PassageResolver.js'));
require(path.join(ROOT, 'js/library/AdsMatching.js'));

const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));
const {
  loadBank,
  loadCuratedExams,
  extractBankReusableParts,
  collectCuratedPartHashes,
  countByTeil,
} = await import('./lib/bankReusableParts.mjs');

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const blueprint = loadBlueprintFileSync('goethe_B1');
const bank = loadBank('de', 'B1');
const curated = loadCuratedExams('de', 'B1');

assert('curated exams loaded', curated.length === 12);
assert('bank has questions', (bank.questions || []).length > 100);

const curatedHashes = collectCuratedPartHashes(curated);
assert('curated hashes collected', curatedHashes.size >= 12);

const { records, stats } = await extractBankReusableParts({
  lang: 'de',
  level: 'B1',
  blueprint,
  bank,
  curatedExams: curated,
  validateRecord: null,
  verbose: false,
});

assert('bank parts extracted', records.length > 0);
assert('some candidates rejected as curated overlap', stats.rejectedCurated > 0);
assert('lesen T3 bank parts exist', (countByTeil(records)['lesen:t3'] || 0) > 0);
assert('lesen T2 count reasonable', (countByTeil(records)['lesen:t2'] || 0) < 50);
assert('horen T1 bank parts exist', (countByTeil(records)['horen:t1'] || 0) > 0);

const bankIds = new Set(records.map((r) => r.id));
assert('all ids bank- prefix', [...bankIds].every((id) => id.startsWith('bank-de-B1-')));

console.log('\nCounts:', countByTeil(records));
console.log('\nseed-reusable-from-bank tests passed.');
