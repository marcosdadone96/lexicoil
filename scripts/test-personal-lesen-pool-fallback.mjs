#!/usr/bin/env node
/**
 * Personal Lesen pool fallback — teil filter, ingest strip, fallback simulation.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { addReusablePart, pickReusablePart } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const {
  lesenBlueprintTeils,
  reusablePartToLesenPart,
  stripPoolPartsForIngest,
  insertLesenTeil,
} = require(path.join(ROOT, 'js/engine/personalLesenPoolFallback.js'));
const { validateLesenT2PassageIntegrity } = require(path.join(
  ROOT,
  'js/engine/validation/lesenPassageIntegrity.js',
));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
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
    async get(key) {
      return blobs.get(key) ?? null;
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

const goetheBp = loadBlueprintFileSync('goethe_B1');
assert('blueprint teils 1-5', lesenBlueprintTeils(goetheBp).join(',') === '1,2,3,4,5');

const store = makeMockStore();

async function seedPart(teil, id, extra = {}) {
  await addReusablePart(store, {
    id,
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil,
    passage: extra.passage || { title: `T${teil}`, text: 'Pool text content.' },
    questions: extra.questions || [{ id: 'q1', question: 'Q?', correct: 'a', options: ['a) x', 'b) y'] }],
    complete: true,
    verified: true,
    ...extra,
  });
}

await seedPart(1, 'pool-t1');
await seedPart(2, 'pool-t2', {
  passage: {
    title: 'Dual',
    passages: [
      { passageId: 'A', textTitle: 'A', text: 'Text A content.' },
      { passageId: 'B', textTitle: 'B', text: 'Text B content.' },
    ],
  },
  questions: [
    ...Array.from({ length: 3 }, (_, i) => ({
      id: String(7 + i),
      passageId: 'A',
      question: `Q${7 + i}?`,
      options: ['a) x', 'b) y', 'c) z'],
      correct: 'a',
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      id: String(10 + i),
      passageId: 'B',
      question: `Q${10 + i}?`,
      options: ['a) x', 'b) y', 'c) z'],
      correct: 'b',
    })),
  ],
});
await seedPart(3, 'pool-t3', {
  ads: Array.from({ length: 10 }, (_, i) => ({
    key: String.fromCharCode(65 + i),
    text: `Kurze Anzeige ${i}.`,
  })),
  questions: Array.from({ length: 7 }, (_, i) => ({
    id: String(13 + i),
    question: `Situation ${13 + i} sucht Anzeige.`,
    type: 'matching',
    correct: 'A',
  })),
});

const wrongTeil = await pickReusablePart(store, 'de', 'B1', 'lesen', { teil: 3 });
assert('pick teil 3 returns a T3 part', Number(wrongTeil?.part?.teil) === 3);

const t1Only = await pickReusablePart(store, 'de', 'B1', 'lesen', { teil: 1 });
assert('pick teil 1 returns a T1 part', Number(t1Only?.part?.teil) === 1);

const none = await pickReusablePart(store, 'de', 'B1', 'lesen', { teil: 99 });
assert('pick missing teil returns null', none === null);

const t3Part = reusablePartToLesenPart(wrongTeil.part);
assert('pool T3 converts to ads_matching items', t3Part.items?.length === 7 && t3Part.ads?.length === 10);

let exam = { lang: 'de', level: 'B1', goetheFormat: true, vocabPersonal: true, lesenParts: [] };
insertLesenTeil(exam, t3Part, 3);
exam._teilFromPool = [3];
assert('exam has pool T3 inserted', exam.lesenParts.some((p) => Number(p.teil) === 3 && p._fromPool));

for (const t of [1, 2]) {
  const picked = await pickReusablePart(store, 'de', 'B1', 'lesen', { teil: t });
  const lp = reusablePartToLesenPart(picked.part);
  insertLesenTeil(exam, lp, t);
  exam._teilFromPool.push(t);
}
exam._teilFromPool = [...new Set(exam._teilFromPool)].sort((a, b) => a - b);
assert('fallback exam has 3 teile from pool (T1,T2,T3)', exam.lesenParts.length === 3);
assert('_teilFromPool includes 3', exam._teilFromPool.includes(3));

const t2 = exam.lesenParts.find((p) => Number(p.teil) === 2);
assert('pool T2 has two passages', (t2.passages?.length || 0) >= 2);
assert('pool T2 no ghost B', validateLesenT2PassageIntegrity(t2).length === 0);

const ingest = stripPoolPartsForIngest({
  ...exam,
  lesenParts: [
    ...exam.lesenParts,
    { teil: 99, _fromPool: false, text: 'AI-only', questions: [{ id: 'z1', question: 'Q', correct: 'a', options: ['a) x'] }] },
  ],
});
assert('ingest strips pool parts', ingest.lesenParts?.length === 1 && Number(ingest.lesenParts[0].teil) === 99);
assert('ingest removes _teilFromPool', ingest._teilFromPool === undefined);

const emptyStore = makeMockStore();
const miss = await pickReusablePart(emptyStore, 'de', 'B1', 'lesen', { teil: 3 });
assert('empty blob store falls back to seed or null', miss === null || Number(miss?.part?.teil) === 3);

console.log('\nPersonal Lesen pool fallback tests passed.');
