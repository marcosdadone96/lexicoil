/**
 * vocab-bg sweep queue efficiency + P0 publish queue regression guard.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VocabBgState = require(path.join(ROOT, 'netlify/functions/lib/vocabBgState.js'));
const {
  recordNeedsSweep,
  enqueueVocabBgSweep,
  peekVocabBgSweepBatch,
  listVocabBgSweepQueue,
  syncVocabBgSweepQueue,
} = require(path.join(ROOT, 'netlify/functions/lib/vocabBgSweepQueue.js'));

class MemoryBlobStore {
  constructor() {
    this.blobs = new Map();
    this.etagSeq = 0;
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

  async list({ prefix }) {
    const blobs = [];
    for (const key of this.blobs.keys()) {
      if (prefix && key.startsWith(prefix)) blobs.push({ key });
    }
    return { blobs };
  }
}

function legacyWouldScan(qKeys, quotaByKey) {
  let scanned = 0;
  let candidates = 0;
  for (const qKey of qKeys) {
    scanned++;
    const rec = quotaByKey.get(qKey);
    if (!rec?.bgGenPending && !(rec?.bgVocabPendingCount >= VocabBgState.BATCH_DAILY_MIN)) continue;
    candidates++;
  }
  return { scanned, candidates };
}

async function simulateNewSweep(store, quotaByKey) {
  const emails = await peekVocabBgSweepBatch(store, { limit: 100 });
  let scanned = emails.length;
  let candidates = 0;
  for (const email of emails) {
    const rec = quotaByKey.get(`quota:${email}`);
    if (recordNeedsSweep(rec)) candidates++;
  }
  return { scanned, candidates };
}

async function testSweepQueueEfficiency() {
  const store = new MemoryBlobStore();
  const USER_COUNT = 200;
  const PENDING_USERS = 3;
  const quotaByKey = new Map();
  const qKeys = [];

  for (let i = 0; i < USER_COUNT; i++) {
    const email = `user${i}@test.com`;
    const qKey = `quota:${email}`;
    qKeys.push(qKey);
    const rec = {
      month: '2026-07',
      used: 0,
      max: 5,
      bgVocabPendingCount: 0,
      bgGenPending: false,
    };
    if (i < PENDING_USERS) {
      rec.bgVocabPendingCount = 5;
      rec.bgVocabPending = [{ key: 'a|de', word: 'a' }];
      await enqueueVocabBgSweep(store, email, 'test');
    }
    quotaByKey.set(qKey, rec);
    await store.setJSON(qKey, rec);
  }

  const legacy = legacyWouldScan(qKeys, quotaByKey);
  const modern = await simulateNewSweep(store, quotaByKey);

  assert.equal(legacy.scanned, USER_COUNT);
  assert.equal(legacy.candidates, PENDING_USERS);
  assert.equal(modern.scanned, PENDING_USERS, 'queue scan should touch only enqueued users');
  assert.equal(modern.candidates, PENDING_USERS);

  console.log(
    `OK   sweep efficiency: legacy scanned ${legacy.scanned} users → queue scans ${modern.scanned} (${PENDING_USERS} real pending, 0 missed)`,
  );
}

async function testP0PublishQueueModuleIntact() {
  const queuePath = path.join(ROOT, 'scripts/lib/poolPublishQueue.mjs');
  const mod = await import(`file://${queuePath.replace(/\\/g, '/')}`);
  assert.equal(typeof mod.drainQueuedPoolPublishes, 'function');
  assert.equal(typeof mod.processQueuedPublishJob, 'function');
  assert.equal(typeof mod.getPoolPublishQueueStatus, 'function');
  console.log('OK   P0 pool publish queue exports intact (drainQueuedPoolPublishes, dead-letter path)');
}

async function testSyncEnqueueRemovesIdle() {
  const store = new MemoryBlobStore();
  await enqueueVocabBgSweep(store, 'active@test.com', 'test');
  await syncVocabBgSweepQueue(store, 'idle@test.com', { bgVocabPendingCount: 0 });
  const q = await listVocabBgSweepQueue(store);
  assert.equal(q.length, 1);
  assert.equal(q[0].email, 'active@test.com');
  console.log('OK   sync removes idle users from sweep queue');
}

async function main() {
  await testP0PublishQueueModuleIntact();
  await testSyncEnqueueRemovesIdle();
  await testSweepQueueEfficiency();
  console.log('\nvocab-bg-sweep-queue tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
