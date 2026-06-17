/**
 * Concurrency tests for quota CAS + append-only pool index (phase 08).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { incrementQuota, decrementQuota, getMonthKey } = require('../netlify/functions/lib/quotaLib.js');
const {
  publishPoolExam,
  listPoolIndexEntries,
  MAX_PER_LEVEL,
  poolExamKey,
  poolIndexEntryKey,
} = require('../netlify/functions/lib/poolIndex.js');

class MemoryBlobStore {
  constructor() {
    this.blobs = new Map();
    this.etagSeq = 0;
  }

  async getWithMetadata(key, { type } = {}) {
    const row = this.blobs.get(key);
    if (!row) return null;
    return { data: structuredClone(row.data), etag: row.etag };
  }

  async get(key, { type } = {}) {
    const row = await this.getWithMetadata(key, { type });
    return row?.data ?? null;
  }

  async setJSON(key, data, opts = {}) {
    const existing = this.blobs.get(key);
    if (opts.onlyIfNew && existing) return { modified: false };
    if (opts.onlyIfMatch && (!existing || existing.etag !== opts.onlyIfMatch)) {
      return { modified: false };
    }
    this.etagSeq += 1;
    const etag = `e${this.etagSeq}`;
    this.blobs.set(key, { data: structuredClone(data), etag });
    return { modified: true, etag };
  }

  async delete(key) {
    this.blobs.delete(key);
  }

  async delete(key) {
    this.blobs.delete(key);
  }

  async list({ prefix }) {
    const blobs = [];
    for (const key of this.blobs.keys()) {
      if (!prefix || key.startsWith(prefix)) blobs.push({ key });
    }
    return { blobs };
  }
}

function makeAuthQuotaState(store, { used = 0, max = 50, email = 'test@example.com' } = {}) {
  return {
    ok: true,
    state: {
      ok: true,
      authenticated: true,
      email,
      plan: 'free',
      used,
      max,
      month: getMonthKey(),
      store,
      qKey: `quota:${email}`,
    },
  };
}

function minimalPoolEntry(id, createdAt) {
  return {
    lang: 'de',
    level: 'B1',
    topic: 'Test',
    exam: {
      lang: 'de',
      level: 'B1',
      sections: [{ id: 's1', questions: [{ id: 'q1', type: 'mcq', prompt: 'x', options: ['a', 'b'], answer: 0 }] }],
    },
    servedCount: 0,
    createdAt,
  };
}

async function testConcurrentQuotaIncrements() {
  const store = new MemoryBlobStore();
  const base = makeAuthQuotaState(store, { max: 100 });
  const N = 25;

  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      incrementQuota(base, { requestId: `req-${i}` }),
    ),
  );

  const blob = await store.get(base.state.qKey, { type: 'json' });
  assert.equal(blob.used, N, `expected ${N} quota increments, got ${blob?.used}`);
  console.log('OK   concurrent quota increments');
}

async function testQuotaIdempotency() {
  const store = new MemoryBlobStore();
  const base = makeAuthQuotaState(store, { max: 10 });
  const requestId = 'same-retry-id';

  const r1 = await incrementQuota(base, { requestId });
  const r2 = await incrementQuota(base, { requestId });
  const r3 = await incrementQuota(base, { requestId });

  assert.equal(r1.used, 1);
  assert.equal(r2.used, 1);
  assert.equal(r3.used, 1);

  const blob = await store.get(base.state.qKey, { type: 'json' });
  assert.equal(blob.used, 1, 'idempotent retries must not double-charge');
  console.log('OK   quota idempotency');
}

async function testQuotaRefund() {
  const store = new MemoryBlobStore();
  const base = makeAuthQuotaState(store, { max: 10 });
  const requestId = 'refund-test-id';

  await incrementQuota(base, { requestId });
  let blob = await store.get(base.state.qKey, { type: 'json' });
  assert.equal(blob.used, 1);

  const r1 = await decrementQuota(base, { requestId });
  assert.equal(r1.used, 0);
  blob = await store.get(base.state.qKey, { type: 'json' });
  assert.equal(blob.used, 0, 'refund restores one unit');

  const r2 = await decrementQuota(base, { requestId });
  assert.equal(r2.used, 0, 'refund idempotent on retry');
  blob = await store.get(base.state.qKey, { type: 'json' });
  assert.equal(blob.used, 0, 'double refund must not go negative');

  await incrementQuota(base, { requestId });
  blob = await store.get(base.state.qKey, { type: 'json' });
  assert.equal(blob.used, 1, 'same requestId can charge again after refund');
  console.log('OK   quota refund + idempotency');
}

async function testQuotaRefundFloor() {
  const store = new MemoryBlobStore();
  const base = makeAuthQuotaState(store, { used: 0, max: 10 });
  const requestId = 'refund-no-prior-charge';
  const skipped = await decrementQuota(base, { requestId });
  assert.equal(skipped.skipped, true);
  const blob = await store.get(base.state.qKey, { type: 'json' });
  assert.equal(blob?.used || 0, 0);
  console.log('OK   quota refund skipped without prior charge');
}

async function testConcurrentPoolPublish() {
  const store = new MemoryBlobStore();
  const lang = 'de';
  const level = 'B1';
  const N = 15;
  const t0 = Date.now();

  await Promise.all(
    Array.from({ length: N }, (_, i) => {
      const id = `exam-${i}`;
      return publishPoolExam(store, {
        lang,
        level,
        id,
        entry: minimalPoolEntry(id, t0 + i),
      });
    }),
  );

  const entries = await listPoolIndexEntries(store, lang, level);
  assert.equal(entries.length, N, `expected ${N} pool index entries, got ${entries.length}`);

  const examKeys = new Set(entries.map((e) => e.examKey));
  assert.equal(examKeys.size, N, 'each publish must retain its exam blob');

  for (let i = 0; i < N; i++) {
    const key = poolExamKey(lang, level, `exam-${i}`);
    const row = await store.get(key, { type: 'json' });
    assert.ok(row, `missing exam blob ${key}`);
  }
  console.log('OK   concurrent pool publish (no lost entries)');
}

async function testPoolRotationByTimestamp() {
  const store = new MemoryBlobStore();
  const lang = 'de';
  const level = 'A2';
  const total = MAX_PER_LEVEL + 5;
  const t0 = 1_700_000_000_000;

  for (let i = 0; i < total; i++) {
    const id = `rot-${String(i).padStart(3, '0')}`;
    await publishPoolExam(store, {
      lang,
      level,
      id,
      entry: minimalPoolEntry(id, t0 + i * 1000),
    });
  }

  const entries = await listPoolIndexEntries(store, lang, level);
  assert.equal(entries.length, MAX_PER_LEVEL, `rotation should cap at ${MAX_PER_LEVEL}`);

  const oldestIdx = poolIndexEntryKey(lang, level, 'rot-000');
  const newestIdx = poolIndexEntryKey(lang, level, `rot-${String(total - 1).padStart(3, '0')}`);
  assert.equal(await store.get(oldestIdx, { type: 'json' }), null, 'oldest index entry should be removed');
  assert.ok(await store.get(newestIdx, { type: 'json' }), 'newest index entry should remain');
  console.log('OK   pool rotation by timestamp');
}

await testConcurrentQuotaIncrements();
await testQuotaIdempotency();
await testQuotaRefund();
await testQuotaRefundFloor();
await testConcurrentPoolPublish();
await testPoolRotationByTimestamp();

console.log('All concurrency quota/pool checks passed.');
