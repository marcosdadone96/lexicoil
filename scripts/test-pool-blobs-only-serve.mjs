/**
 * Pool serve test — blobs-only mode (no local-seed fallback).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.POOL_SOURCE = 'blobs';
delete process.env.POOL_ALLOW_LOCAL_SEED;

const { pickReusablePart, pickReusablePartByVocab } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const { clearAllPoolCaches } = require(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));
const { useLocalSeedInRuntime } = require(path.join(ROOT, 'netlify/functions/lib/poolSourceMode.js'));

class MemoryBlobStore {
  constructor() {
    this.blobs = new Map();
    this.etagSeq = 0;
  }

  async list({ prefix }) {
    const blobs = [];
    for (const key of this.blobs.keys()) {
      if (prefix && !key.startsWith(prefix)) continue;
      blobs.push({ key });
    }
    return { blobs };
  }

  async get(key) {
    const row = this.blobs.get(key);
    return row ? structuredClone(row.data) : null;
  }

  async getWithMetadata(key) {
    const row = this.blobs.get(key);
    if (!row) return null;
    return { data: structuredClone(row.data), etag: row.etag };
  }

  async setJSON(key, data) {
    this.etagSeq += 1;
    this.blobs.set(key, { data: structuredClone(data), etag: `e${this.etagSeq}` });
    return { modified: true };
  }
}

function makePart(id, teil, words = []) {
  return {
    id,
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil,
    topicTag: 'Umwelt',
    instruction: 'Lesen.',
    complete: true,
    verified: true,
    sem1Ok: true,
    sem1VerifiedAt: new Date().toISOString(),
    passage: {
      title: `Test ${id}`,
      text: `Eindeutiger Text für ${id} mit fitness therapie urlaub und genug Länge für Publish Gate.`,
    },
    questions: [
      { id: 'q1', question: 'Frage?', options: [{ key: 'A', text: 'ja' }, { key: 'B', text: 'nein' }], answer: 'A' },
    ],
    vocabKeys: words.map((w) => w.toLowerCase()),
  };
}

async function seedStore(store) {
  const part = {
    id: 'blob-lesen-t1-a',
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil: 1,
    topicTag: 'Umwelt',
    instruction: 'Lesen.',
    complete: true,
    verified: true,
    sem1Ok: true,
    sem1VerifiedAt: new Date().toISOString(),
    passage: { title: 'T', text: 'fitness therapie eindeutiger text lang genug' },
    questions: [{ id: 'q1', question: 'q', options: [{ key: 'A', text: 'a' }], answer: 'A' }],
  };
  const payloadKey = `reusable_part:de:B1:lesen:${part.id}`;
  const indexKey = `reusable_part_idx:de:B1:lesen:${part.id}`;
  await store.setJSON(payloadKey, part);
  await store.setJSON(indexKey, {
    id: part.id,
    partKey: payloadKey,
    teil: part.teil,
    complete: true,
    verified: true,
    createdAt: Date.now(),
    servedCount: 0,
  });
}

async function main() {
  assert.equal(useLocalSeedInRuntime(), false, 'POOL_SOURCE=blobs must disable local seed');

  const { loadModuleSearchRows } = require(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));

  const store = new MemoryBlobStore();
  await seedStore(store);

  const loaded = await loadModuleSearchRows(store, 'de', 'B1', 'lesen');
  assert.ok(loaded.rows.length >= 1, `expected search rows, got ${loaded.rows.length}`);

  const t0 = performance.now();
  const generic = await pickReusablePart(store, 'de', 'B1', 'lesen', { teil: 1 });
  const tGeneric = performance.now() - t0;

  assert.ok(generic?.part, 'generic pool pick must return a part');
  assert.notEqual(generic.source, 'local-seed', 'must not use local-seed');

  clearAllPoolCaches();
  const t1 = performance.now();
  const personal = await pickReusablePartByVocab(store, 'de', 'B1', 'lesen', {
    teil: 1,
    words: ['fitness', 'therapie'],
  });
  const tPersonal = performance.now() - t1;

  assert.ok(personal?.part, 'personal vocab pick must return a part');
  assert.notEqual(personal.source, 'local-seed');

  console.log(`OK   blobs-only generic pick: ${generic.id} in ${tGeneric.toFixed(1)}ms`);
  console.log(`OK   blobs-only personal pick: ${personal.id} in ${tPersonal.toFixed(1)}ms (covered=${personal.coveredWords.length})`);
  console.log('\npool-blobs-only-serve tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
