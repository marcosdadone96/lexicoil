#!/usr/bin/env node
/**
 * Simulates Personal Lesen B1 pool-first assembly (5 Teile) via exam-part pick chain.
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
const { lesenBlueprintTeils, reusablePartToLesenPart } = require(path.join(
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

const topic = 'Umwelt';
const words = ['Recycling', 'Klimawandel', 'Umwelt', 'Müll', 'Energie'];
const lemmas = lemmatizeWords(words, 'de');
const bp = loadBlueprintFileSync('goethe_B1');
const teils = lesenBlueprintTeils(bp);
const t0 = Date.now();
const parts = [];
const missing = [];
const relaxed = [];
const covered = new Set();

for (const teil of teils) {
  const hit = await pickReusablePartByVocab(store, 'de', 'B1', 'lesen', {
    teil,
    topicTag: topic,
    words: lemmas,
    excludeIds: parts.map((p) => p.id),
  });
  if (!hit?.part) {
    missing.push(teil);
    continue;
  }
  if (hit.topicRelaxed) relaxed.push(teil);
  (hit.coveredWords || []).forEach((w) => covered.add(w));
  const converted = reusablePartToLesenPart(hit.part);
  parts.push({ teil, id: hit.id, topicTag: hit.topicTag, converted });
}

const ms = Date.now() - t0;
console.log(`Topic: ${topic}`);
console.log(`Words: ${words.join(', ')}`);
console.log(`Assembled ${parts.length}/${teils.length} Teile in ${ms}ms`);
console.log(`Vocab covered: ${covered.size}/${lemmas.length} lemmas`);
if (missing.length) console.log(`Missing Teile: ${missing.join(', ')}`);
if (relaxed.length) console.log(`Topic relaxed Teile: ${relaxed.join(', ')}`);
for (const p of parts) {
  console.log(`  T${p.teil}: ${p.id} (${p.topicTag || '?'}) items=${(p.converted.items || p.converted.questions || []).length}`);
}

if (!parts.length) {
  console.error('\nFAIL: no parts assembled');
  process.exit(1);
}
if (ms > 3000) {
  console.warn('\nWARN: assembly took >3s (seed-only; OK on cold start)');
}
console.log('\nOK: Personal Lesen pool-first assembly simulation passed.');
