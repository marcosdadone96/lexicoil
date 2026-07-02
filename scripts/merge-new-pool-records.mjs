/**
 * merge-new-pool-records.mjs
 * Merges new bank records into de_B1.json without overwriting existing ones.
 * Reads existing pool, extracts NEW records from bank (by ID), merges and writes.
 * Run: node scripts/merge-new-pool-records.mjs --apply
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadBank, extractBankReusableParts, loadCuratedExams } from './lib/bankReusableParts.mjs';
import { examTypeForLang } from './lib/examPipeline.mjs';
import { loadEnvFile } from './lib/loadEnv.mjs';
import { createRequire } from 'node:module';

loadEnvFile();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { loadBlueprintFileSync } = require(path.join(ROOT, 'js/engine/validation/blueprintResolver.js'));

const apply = process.argv.includes('--apply');
const SEED_PATH = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const lang = 'de', level = 'B1';

const blueprint = loadBlueprintFileSync(`${examTypeForLang(lang)}_${level}`);
const bank = loadBank(lang, level);
const curated = loadCuratedExams(lang, level);

const { records: newRecs, stats } = await extractBankReusableParts({
  lang, level, blueprint, bank,
  curatedExams: curated,
  validateRecord: null,
  maxPerTeil: 50,
});

console.log(`Extracted ${newRecs.length} candidate records from bank`);
console.log('By Teil:', stats.rejectedGate, 'gate-rejected,', stats.rejectedFidelity, 'fidelity-rejected');

// Load existing pool
const existingRaw = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
const existingPool = Array.isArray(existingRaw) ? existingRaw : existingRaw.records || [];
const existingIds = new Set(existingPool.map(r => r.id));

console.log(`\nExisting pool: ${existingPool.length} records`);
console.log(`New from bank: ${newRecs.length} total`);

const toAdd = newRecs.filter(r => !existingIds.has(r.id));
console.log(`Truly new (not already in pool): ${toAdd.length}`);

for (const r of toAdd) {
  console.log(`  + ${r.id}`);
}

if (apply) {
  const merged = [...existingPool, ...toAdd];
  writeFileSync(SEED_PATH, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`\n✅ Wrote ${merged.length} records to ${SEED_PATH}`);
} else {
  console.log('\nDry-run. Pass --apply to write.');
}
