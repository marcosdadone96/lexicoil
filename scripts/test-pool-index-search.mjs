#!/usr/bin/env node
/**
 * test-pool-index-search.mjs — PASO 1–3: topicTag, vocabIndex, buscar().
 *
 * Run:
 *   node scripts/enrich-reusable-index.mjs --apply
 *   node scripts/test-pool-index-search.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { applyPartIndex, buscar } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));
const { addReusablePart } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));
const { tagBatchWithTopic } = await import('./lib/topicRotation.mjs');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg}`);
    failed++;
  }
}

function loadSeedRecords() {
  const dir = path.join(ROOT, 'library/reusable-seed');
  const records = [];
  for (const suffix of ['.json', '.bank.json']) {
    const file = path.join(dir, `de_B1${suffix}`);
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(data.records)) records.push(...data.records);
  }
  return records;
}

console.log('\n══ PASO 1 — topicTag en seed ══');
const records = loadSeedRecords();
const withTag = records.filter((r) => r.topicTag);
const unknown = records.filter((r) => !r.topicTag);
console.log(`  Total partes seed:     ${records.length}`);
console.log(`  Con topicTag B1:       ${withTag.length}`);
console.log(`  Sin clasificar (null): ${unknown.length}`);
if (unknown.length) {
  console.log(`  IDs sin topicTag:      ${unknown.slice(0, 5).map((r) => r.id).join(', ')}${unknown.length > 5 ? '…' : ''}`);
}
assert(withTag.length > 0, 'seed tiene partes con topicTag (ejecuta enrich-reusable-index --apply si falla)');

console.log('\n══ PASO 2 — vocabIndex extensible ══');
const withIndex = records.filter((r) => Array.isArray(r.vocabIndex) && r.vocabIndex.length);
assert(withIndex.length > 0, 'seed tiene vocabIndex');
const sample = withIndex.find((r) => r.module === 'lesen' && r.teil === 2) || withIndex[0];
console.log(`  Ejemplo: ${sample.id} (${sample.module} T${sample.teil}, topicTag=${sample.topicTag})`);
console.log('  vocabIndex (primeras 6 entradas):');
console.log(JSON.stringify(sample.vocabIndex.slice(0, 6), null, 2));
assert(typeof sample.vocabIndex[0] === 'object' && sample.vocabIndex[0].word, 'vocabIndex es lista de objetos {word}, no strings');
assert(sample.vocabIndex[0].lemma === undefined, 'lemma aún ausente — se añadirá sin migración');

console.log('\n══ PASO 3 — buscar() Lesen T2 Umwelt ══');
const words = ['Klimawandel', 'Mülltrennung'];
const hits = buscar(records, {
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 2,
  topicTag: 'Umwelt',
  words,
  literal: true,
});
console.log(`  Query: lesen T2, topic=Umwelt, words=${JSON.stringify(words)}`);
console.log(`  Resultados: ${hits.length} (sin overlap vocab → score 0, sigue en pool-first)`);
assert(Array.isArray(hits), 'buscar devuelve array');
if (hits.length) {
  assert(hits.every((h) => h.score === 0), 'sin overlap → score 0 pero partes del tema');
  assert(hits.every((h) => h.topicTag === 'Umwelt'), 'hits siguen filtrados por topicTag');
} else {
  assert(true, 'sin partes Umwelt T2 en seed → vacío OK');
}

const demoWords = ['Alltag', 'Mitglieder'];
const demoHits = buscar(records, {
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 2,
  topicTag: 'Umwelt',
  words: demoWords,
  literal: true,
});
console.log(`\n  Demo con palabras del pool: ${JSON.stringify(demoWords)}`);
console.log(`  Resultados: ${demoHits.length}`);
for (const h of demoHits) {
  console.log(`    • ${h.id}  score=${h.score}  covered=${JSON.stringify(h.coveredWords)}`);
}
assert(demoHits.length >= 2, 'demo Umwelt T2 devuelve partes que cuadran');
assert(demoHits[0].score >= demoHits[1].score, 'ordenadas por cobertura descendente');
for (const h of demoHits) {
  assert(h.topicTag === 'Umwelt', `hit ${h.id} tiene topicTag Umwelt`);
}

console.log('\n══ PASO 3b — buscar sin overlap vocab (ranking, no filter) ══');
const empty = buscar(records, {
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 2,
  topicTag: 'Umwelt',
  words: ['Epistemologie', 'Quantenphysik'],
  literal: true,
});
if (empty.length) {
  assert(empty.every((h) => h.score === 0), 'palabras ajenas → score 0, no descarta');
  assert(empty[0].topicTag === 'Umwelt', 'sigue en tema Umwelt');
} else {
  assert(true, 'sin partes Umwelt T2 → vacío OK');
}

console.log('\n══ Generador Fase 3 — topicTag en batch nuevo ══');
const batch = tagBatchWithTopic({ passages: [{ text: 'Recycling und Klimawandel in der Stadt.' }] }, 'Umwelt');
assert(batch.topicTag === 'Umwelt', 'tagBatchWithTopic pone topicTag en raíz del batch');
assert(batch.passages[0].topicTag === 'Umwelt', 'tagBatchWithTopic en passage');

console.log('\n══ addReusablePart aplica índice ══');
const store = {
  blobs: new Map(),
  async setJSON(key, value, opts = {}) {
    if (opts.onlyIfNew && this.blobs.has(key)) return { modified: false };
    this.blobs.set(key, value);
    return { modified: true };
  },
  async get(key) { return this.blobs.get(key) ?? null; },
  async delete(key) { this.blobs.delete(key); },
  async list({ prefix }) {
    const keys = [...this.blobs.keys()].filter((k) => k.startsWith(prefix));
    return { blobs: keys.map((key) => ({ key })) };
  },
};
const { partKey } = await addReusablePart(store, {
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 1,
  topicTag: 'Umwelt',
  passage: { title: 'Klimawandel', text: 'Die Mülltrennung ist wichtig für die Umwelt und den Klimawandel.' },
  questions: [{ id: 'q1', type: 'true_false', question: 'Test?', answer: true }],
  complete: true,
  verified: true,
});
const stored = await store.get(partKey);
assert(stored.topicTag === 'Umwelt', 'addReusablePart persiste topicTag');
assert(Array.isArray(stored.vocabIndex) && stored.vocabIndex[0]?.word, 'addReusablePart persiste vocabIndex [{word}]');

console.log('\n══ Cobertura total seed ══');
const noIndex = records.filter((r) => !Array.isArray(r.vocabIndex));
const emptyIndex = records.filter((r) => Array.isArray(r.vocabIndex) && !r.vocabIndex.length);
assert(noIndex.length === 0, `todas las ${records.length} partes seed tienen vocabIndex[]`);
console.log(`  ${records.length} partes · ${records.length - emptyIndex.length} con palabras · ${emptyIndex.length} vacías`);

console.log(`\n${'─'.repeat(40)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
