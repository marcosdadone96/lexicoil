#!/usr/bin/env node
/**
 * Simulates Personal Hören B1 pool-first assembly (4 Teile) via exam-part pick chain.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { pickReusablePartByVocab } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const { horenBlueprintTeils, reusablePartToHorenPart } = require(path.join(
  ROOT,
  'js/engine/personalLesenPoolFallback.js',
));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));
const { lemmatizeWords } = require(path.join(
  ROOT,
  'netlify/functions/lib/passageVocab.js',
));

const store = {
  async setJSON() { return { modified: true }; },
  async get() { return null; },
  async delete() {},
  async list() { return { blobs: [] }; },
};

const words = ['Arbeit', 'Auto', 'Umwelt', 'Hören', 'Frage'];
const lemmas = lemmatizeWords(words, 'de');
const bp = loadBlueprintFileSync('goethe_B1');
const teils = horenBlueprintTeils(bp);
const t0 = Date.now();
const parts = [];
const missing = [];
const covered = new Set();

for (const teil of teils) {
  const hit = await pickReusablePartByVocab(store, 'de', 'B1', 'horen', {
    teil,
    words: lemmas,
    excludeIds: parts.map((p) => p.id),
  });
  if (!hit?.part) {
    missing.push(teil);
    continue;
  }
  (hit.coveredWords || []).forEach((w) => covered.add(w));
  const converted = reusablePartToHorenPart(hit.part, bp);
  parts.push({ teil, id: hit.id, converted });
}

const ms = Date.now() - t0;
console.log(`Words: ${words.join(', ')}`);
console.log(`Assembled ${parts.length}/${teils.length} Hören Teile in ${ms}ms`);
console.log(`Vocab covered: ${covered.size}/${lemmas.length} lemmas`);
if (missing.length) console.log(`Missing Teile: ${missing.join(', ')}`);
for (const p of parts) {
  const items = p.converted?.questions?.length || p.converted?.segments?.length || 0;
  console.log(`  T${p.teil}: ${p.id} items=${items}`);
}

if (!parts.length) {
  console.error('\nFAIL: no horen parts assembled');
  process.exit(1);
}
if (parts.length < 4) {
  console.warn(`\nWARN: only ${parts.length}/4 Teile (pool gaps)`);
}
console.log('\nPersonal Hören pool assemble OK.');
