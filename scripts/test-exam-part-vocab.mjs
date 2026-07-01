#!/usr/bin/env node
/**
 * Offline checks for GET exam-part vocab selection (pickReusablePartByVocab).
 * Seeds a mock blob store from library/reusable-seed/de_B1.json lesen T2 parts.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { addReusablePart, pickReusablePartByVocab } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const { lemmatizeWords } = require(path.join(
  ROOT,
  'netlify/functions/lib/passageVocab.js',
));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

function makeMockStore() {
  const blobs = new Map();
  return {
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && blobs.has(key)) return { modified: false };
      blobs.set(key, value);
      return { modified: true };
    },
    async get(key, opts = {}) {
      const v = blobs.get(key) ?? null;
      if (opts.type === 'json' && v != null && typeof v !== 'object') return JSON.parse(v);
      return v;
    },
    async delete(key) {
      blobs.delete(key);
    },
    async list({ prefix }) {
      const keys = [...blobs.keys()].filter((k) => k.startsWith(prefix));
      return { blobs: keys.map((key) => ({ key })) };
    },
  };
}

const seedPath = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const t2Parts = (seed.records || []).filter(
  (r) => r.module === 'lesen' && r.teil === 2 && r.complete && r.verified,
);
assert('seed has lesen T2 parts', t2Parts.length >= 2);

const store = makeMockStore();
for (const row of t2Parts) {
  const { partKey } = await addReusablePart(store, {
    id: row.id,
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil: 2,
    passage: row.passage,
    questions: row.questions,
    complete: true,
    verified: true,
  });
  // Simula blobs enriquecidos (enrich-reusable-vocab --apply).
  const stored = await store.get(partKey);
  await store.setJSON(partKey, {
    ...stored,
    topic: row.topic || null,
    vocab: row.vocab || [],
  });
}

// Words that lemmatize to exact entries in vegane-ernahrung vocab[]
const veganWords = ['Gesundheitsapp', 'Datenschutzeinstellung', 'Smartphone-App'];
const wantLemmas = lemmatizeWords(veganWords, 'de');
assert('lemmatize maps to 3 distinct lemmas', wantLemmas.length === 3);

const picked = await pickReusablePartByVocab(store, 'de', 'B1', 'lesen', {
  teil: 2,
  words: wantLemmas,
});
assert('vocab pick returns a part', !!picked?.part);
assert('topic is vegane kantine', picked.topic === 'vegane-ernahrung-in-der-kantine');
assert('coverage 3/3', picked.coverage?.covered === 3 && picked.coverage?.requested === 3);
assert(
  'coveredWords are requested lemmas present in vocab',
  picked.coveredWords.every((w) => wantLemmas.includes(w)),
);
assert(
  'coveredWords ⊆ part.vocab',
  picked.coveredWords.every((w) => (picked.part.vocab || []).includes(w)),
);

const excluded = await pickReusablePartByVocab(store, 'de', 'B1', 'lesen', {
  teil: 2,
  words: lemmatizeWords(['alltag', 'thema'], 'de'),
  excludeTopics: ['vegane-ernahrung-in-der-kantine'],
});
assert('excludeTopics avoids vegan part', excluded.topic !== 'vegane-ernahrung-in-der-kantine');
assert('keeps max coverage among non-excluded (tie at 2)', excluded.coverage?.covered === 2);

// User example (may not match vocab lemmas — documents real behavior)
const userLemmas = lemmatizeWords(['gesundheit', 'datenschutz', 'app'], 'de');
const userPick = await pickReusablePartByVocab(store, 'de', 'B1', 'lesen', {
  teil: 2,
  words: userLemmas,
});
assert('user example still returns a part', !!userPick?.part);
console.log(
  'INFO: gesundheit,datenschutz,app → lemmas',
  userLemmas,
  'coverage',
  userPick.coverage,
);

console.log('\nAll exam-part vocab checks passed.');
