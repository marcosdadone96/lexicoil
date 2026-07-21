#!/usr/bin/env node
/**
 * Phase 1 — Personal Lesen pool-first: topicTag serve + vocab ranking (score 0 OK).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { addReusablePart, pickReusablePartByTopic, pickReusablePartByVocab } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const { buscar } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));
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

const store = makeMockStore();

async function seed(teil, id, topicTag, text, extra = {}) {
  await addReusablePart(store, {
    id,
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil,
    topicTag,
    passage: { title: `${topicTag} T${teil}`, text },
    questions: extra.questions || [
      { id: 'q1', question: 'Frage?', correct: 'a', options: ['a) x', 'b) y'] },
    ],
    complete: true,
    verified: true,
    ...extra,
  });
}

await seed(1, 'umwelt-t1-a', 'Umwelt', 'Recycling und Klimawandel in der Stadt.');
await seed(1, 'technik-t1-a', 'Technik', 'Smartphones und Apps im Alltag.');
await seed(2, 'umwelt-t2-a', 'Umwelt', 'Mülltrennung ist wichtig.');
await seed(3, 'bildung-t3-a', 'Bildung', 'Schule und Lernen zu Hause.');

const byTopic = await pickReusablePartByTopic(store, 'de', 'B1', 'lesen', {
  teil: 1,
  topicTag: 'Umwelt',
});
assert('pickReusablePartByTopic returns Umwelt T1', byTopic?.topicTag === 'Umwelt' && Number(byTopic?.part?.teil) === 1);
assert('topicTag on result', byTopic?.topicTag === 'Umwelt');

const unrelated = lemmatizeWords(['Quantenphysik', 'Epistemologie'], 'de');
const ranked = await pickReusablePartByVocab(store, 'de', 'B1', 'lesen', {
  teil: 1,
  topicTag: 'Umwelt',
  words: unrelated,
});
assert('vocab pick with zero overlap still serves Umwelt T1', ranked?.topicTag === 'Umwelt' && Number(ranked?.part?.teil) === 1);
assert('coverage 0/N allowed', ranked?.coverage?.covered === 0);

const relaxed = await pickReusablePartByVocab(store, 'de', 'B1', 'lesen', {
  teil: 3,
  topicTag: 'Umwelt',
  words: lemmatizeWords(['Schule'], 'de'),
});
assert('missing Umwelt T3 serves another part', !!relaxed?.part && Number(relaxed.part.teil) === 3);
assert('topicRelaxed flag set', relaxed?.topicRelaxed === true);

const parts = [byTopic.part];
const hits = buscar(parts, {
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 1,
  topicTag: 'Umwelt',
  words: unrelated,
});
assert('buscar keeps score-0 hits', hits.length === 1 && hits[0].score === 0);

console.log('\nPersonal Lesen pool-first tests passed.');
