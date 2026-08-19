#!/usr/bin/env node
/**
 * Textos pick — integration tests (mock store + official index).
 * Run: node scripts/lib/__tests__/textos-pick.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from '../loadEnv.mjs';

process.env.POOL_SOURCE = 'blobs';

const require = createRequire(import.meta.url);
const { addReusablePart } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const { clearAllPoolCaches } = require(path.join(
  ROOT,
  'netlify/functions/lib/poolSearchCache.js',
));
const { pickTextosReading } = require(path.join(ROOT, 'netlify/functions/lib/textosPick.js'));
const {
  loadOfficialReservedIndex,
  reservedPartIdSet,
} = require(path.join(ROOT, 'netlify/functions/lib/officialReservedIndex.js'));

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
    async list({ prefix }) {
      const keys = [...blobs.keys()].filter((k) => k.startsWith(prefix));
      return { blobs: keys.map((key) => ({ key })) };
    },
  };
}

const index = loadOfficialReservedIndex({ lang: 'de', level: 'B1', root: ROOT, refresh: true });
assert.ok(index, 'de_B1 official index must exist — run build-official-reserved-index.mjs');
const reserved = reservedPartIdSet(index);

const store = makeMockStore();
const longText =
  'Recycling und Klimawandel sind wichtige Themen in unserer Stadt. '
  + 'Viele Familien trennen Müll und nutzen öffentliche Verkehrsmittel. '
  + 'Die Gemeinde pflanzt neue Bäume und fördert Solarenergie auf Dächern.';

await addReusablePart(store, {
  id: 'textos-free-umwelt-t1',
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 1,
  topicTag: 'Umwelt',
  passage: { title: 'Grüne Stadt', text: longText },
  questions: [{ id: 'q1', question: 'Geheim?', correct: 'a', options: ['a) x'] }],
  complete: true,
  verified: true,
  sem1VerifiedAt: '2026-08-19T00:00:00.000Z',
});

await addReusablePart(store, {
  id: 'lesen-t1-gemini-155',
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 1,
  topicTag: 'Umwelt',
  passage: {
    title: 'Official reserved',
    text:
      'Dieser Text gehört zu einem offiziellen Examen und darf nicht in Textos erscheinen. '
      + 'Er enthält genug Wörter um den Mindestfilter zu passieren wenn fuese.',
  },
  questions: [{ id: 'q1', question: 'Secret?', correct: 'a' }],
  complete: true,
  verified: true,
  sem1VerifiedAt: '2026-08-19T00:00:00.000Z',
});

assert.ok(reserved.has('lesen-t1-gemini-155'), 'fixture part must be in live official index');

clearAllPoolCaches();

const ok = await pickTextosReading(store, {
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  topicTag: 'Umwelt',
  teil: 1,
});
assert.equal(ok.status, 200);
assert.equal(ok.body.purpose, 'textos');
assert.equal(ok.body.id, 'textos-free-umwelt-t1');
assert.ok(!JSON.stringify(ok.body).includes('Geheim'));
assert.ok(!JSON.stringify(ok.body).includes('questions'));
assert.ok(!JSON.stringify(ok.body).includes('correct'));
assert.equal(ok.body.meta.officialReserved, false);

const noTopic = await pickTextosReading(store, {
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  topicTag: '',
});
assert.equal(noTopic.status, 400);
assert.equal(noTopic.body.error, 'topic_required');

const wrongModule = await pickTextosReading(store, {
  lang: 'de',
  level: 'B1',
  module: 'horen',
  topicTag: 'Umwelt',
});
assert.equal(wrongModule.status, 400);
assert.equal(wrongModule.body.error, 'textos_lesen_only');

const missingTopicPool = await pickTextosReading(store, {
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  topicTag: 'Sport',
  teil: 9,
});
assert.equal(missingTopicPool.status, 404);
assert.equal(missingTopicPool.body.error, 'textos_no_match');

console.log('PASS: textos-pick', JSON.stringify({ pickedId: ok.body.id, topicTag: ok.body.topicTag }));
