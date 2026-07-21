/**
 * P0-1 evidence: pool_publish_queue drains with real publish — 0 losses under lock contention.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enqueuePoolPublishJob } from './lib/poolPublishLock.mjs';
import {
  drainQueuedPoolPublishes,
  getPoolPublishQueueStatus,
  processQueuedPublishJob,
  verifyQueuedRecordsInPool,
} from './lib/poolPublishQueue.mjs';

class MemoryBlobStore {
  constructor() {
    this.blobs = new Map();
    this.etagSeq = 0;
  }

  async getWithMetadata(key) {
    const row = this.blobs.get(key);
    if (!row) return null;
    return { data: structuredClone(row.data), etag: row.etag };
  }

  async get(key) {
    const row = await this.getWithMetadata(key);
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

  async list({ prefix }) {
    const blobs = [];
    for (const key of this.blobs.keys()) {
      if (prefix && !key.startsWith(prefix)) continue;
      blobs.push({ key });
    }
    return { blobs };
  }
}

function makeTestRecord(i) {
  const uniqueWords = [
    'Klimawandel', 'Solarenergie', 'Windkraft', 'Recycling', 'Biodiversität',
    'Wasserschutz', 'Waldschutz', 'Elektromobilität',
  ];
  const filler = Array.from({ length: 24 }, (_, j) => `${uniqueWords[i]}-wort-${j}`).join(' ');
  return {
    id: `test-queue-rec-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil: 1,
    topicTag: 'Umwelt',
    instruction: 'Lesen Sie den Text.',
    passage: {
      title: `Thema ${uniqueWords[i]}`,
      text: `${uniqueWords[i]} ${filler}`,
    },
    questions: [
      { id: 'q1', question: 'Was steht im Text?', options: [{ key: 'A', text: 'Ja' }, { key: 'B', text: 'Nein' }], answer: 'A' },
    ],
  };
}

function holdFileLock(poolFile, ms = 600) {
  const lockPath = `${poolFile}.lock`;
  fs.mkdirSync(path.dirname(poolFile), { recursive: true });
  const holder = 'test-holder';
  const t = Date.now();
  fs.writeFileSync(lockPath, JSON.stringify({ holder, acquiredAt: t, expiresAt: t + ms + 5000 }));
  return () => {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  };
}

async function testLockContentionRetriesNotFakeSuccess() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicoil-queue-'));
  const poolFile = path.join(tmp, 'de_B1.json');
  fs.writeFileSync(poolFile, JSON.stringify({ lang: 'de', level: 'B1', records: [] }, null, 2));
  const store = new MemoryBlobStore();
  const record = makeTestRecord(0);

  const job = await enqueuePoolPublishJob(store, 'de', 'B1', {
    type: 'append_record',
    poolFile,
    lang: 'de',
    level: 'B1',
    payload: { recordId: record.id, record, publishOpts: {} },
  });

  process.env.POOL_PUBLISH_QUEUE_BACKOFF_MS = '80';
  process.env.POOL_PUBLISH_LOCK_ATTEMPTS = '4';

  const release = holdFileLock(poolFile, 1500);
  const r = await processQueuedPublishJob(store, job);
  release();

  assert.equal(r.queued, true, 'lock busy must re-queue, not fake-success');
  assert.ok(r.job?.retries >= 1);
  assert.ok(r.nextRetryAt > Date.now() - 50);

  const pool = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
  assert.equal(pool.records.length, 0, 'must not mark processed without publish');

  console.log('OK   lock contention → retry/backoff, not silent drop');
}

async function testQueueDrainZeroLosses() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicoil-queue-'));
  const poolFile = path.join(tmp, 'de_B1.json');
  fs.writeFileSync(poolFile, JSON.stringify({ lang: 'de', level: 'B1', records: [] }, null, 2));

  const store = new MemoryBlobStore();
  const N = 8;
  const records = Array.from({ length: N }, (_, i) => makeTestRecord(i));
  const recordIds = records.map((r) => r.id);

  for (const record of records) {
    await enqueuePoolPublishJob(store, 'de', 'B1', {
      type: 'append_record',
      poolFile,
      lang: 'de',
      level: 'B1',
      payload: { recordId: record.id, record, publishOpts: {} },
    });
  }

  const preStatus = await getPoolPublishQueueStatus(store, 'de', 'B1');
  assert.equal(preStatus.pending, N, `expected ${N} queued jobs`);

  process.env.POOL_PUBLISH_QUEUE_BACKOFF_MS = '40';
  process.env.POOL_PUBLISH_QUEUE_MAX_RETRIES = '25';
  process.env.POOL_PUBLISH_LOCK_ATTEMPTS = '10';

  const release = holdFileLock(poolFile, 350);
  const drainPromise = drainQueuedPoolPublishes(store, 'de', 'B1');
  await new Promise((r) => setTimeout(r, 200));
  release();
  const drained = await drainPromise;

  const verify = verifyQueuedRecordsInPool(poolFile, recordIds);
  assert.equal(verify.missing.length, 0, `missing records: ${verify.missing.join(', ')}`);
  assert.equal(verify.present.length, N, `expected ${N} published, got ${verify.present.length}`);

  const finalStatus = await getPoolPublishQueueStatus(store, 'de', 'B1');
  assert.equal(finalStatus.pending, 0, `queue should be empty, pending=${finalStatus.pending}`);
  assert.equal(finalStatus.deadLetterCount, 0, 'no dead letters');

  console.log(`OK   pool queue drain: ${N}/${N} published, 0 dead-letter, ${drained.rounds} rounds`);
}

async function testFullRecordPayloadRequired() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicoil-queue-'));
  const poolFile = path.join(tmp, 'de_B1.json');
  fs.writeFileSync(poolFile, JSON.stringify({ lang: 'de', level: 'B1', records: [] }, null, 2));
  const store = new MemoryBlobStore();

  await enqueuePoolPublishJob(store, 'de', 'B1', {
    type: 'append_record',
    poolFile,
    lang: 'de',
    level: 'B1',
    payload: { recordId: 'orphan-id' },
  });

  const drained = await drainQueuedPoolPublishes(store, 'de', 'B1');
  assert.equal(drained.deadLettered, 1, 'recordId-only payload should dead-letter, not fake-success');

  const status = await getPoolPublishQueueStatus(store, 'de', 'B1');
  assert.equal(status.pending, 0);
  assert.equal(status.deadLetterCount, 1);
  assert.match(status.deadLetterRecent[0].error, /missing_record_payload/);

  console.log('OK   recordId-only jobs dead-letter (no silent drop)');
}

async function main() {
  await testFullRecordPayloadRequired();
  await testLockContentionRetriesNotFakeSuccess();
  await testQueueDrainZeroLosses();
  console.log('\npool-publish-queue tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
