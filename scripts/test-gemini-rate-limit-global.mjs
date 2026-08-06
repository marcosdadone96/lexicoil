/**
 * P0-2 evidence: global Gemini rate limit via blob CAS — collective RPM across parallel instances.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { acquire, readUsage, rpmLimit, USAGE_BLOB_KEY } = require('../netlify/functions/lib/geminiRateLimitCore.js');

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
}

function maxInSlidingWindow(timestamps, windowMs) {
  const sorted = [...timestamps].sort((a, b) => a - b);
  let max = 0;
  for (let i = 0; i < sorted.length; i++) {
    const end = sorted[i] + windowMs;
    let count = 0;
    for (let j = i; j < sorted.length && sorted[j] < end; j++) count++;
    max = Math.max(max, count);
  }
  return max;
}

async function simulateInstance(store, n, label) {
  const hits = [];
  for (let i = 0; i < n; i++) {
    await acquire(store);
    hits.push(Date.now());
  }
  return { label, hits };
}

async function testCollectiveRpmLimit() {
  const store = new MemoryBlobStore();
  const prevRpm = process.env.GEMINI_RPM;
  const prevRpd = process.env.GEMINI_RPD;
  process.env.GEMINI_RPM = '10';
  process.env.GEMINI_RPD = '100';

  const rpm = rpmLimit();
  const instances = 4;
  const perInstance = 3;
  const t0 = Date.now();

  const results = await Promise.all(
    Array.from({ length: instances }, (_, i) => simulateInstance(store, perInstance, `lambda-${i}`)),
  );

  const usage = await readUsage(store);
  const total = usage.count;
  const allTs = results.flatMap((r) => r.hits);

  assert.equal(total, instances * perInstance, `expected ${instances * perInstance} global acquires, got ${total}`);
  assert.equal(allTs.length, instances * perInstance);

  const maxBurst = maxInSlidingWindow(usage.timestamps, 60000);
  assert.ok(
    maxBurst <= rpm,
    `collective RPM exceeded: max ${maxBurst} in 60s window (limit ${rpm})`,
  );

  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 1000, `parallel instances should throttle (elapsed ${elapsed}ms)`);

  const blob = await store.get(USAGE_BLOB_KEY, { type: 'json' });
  assert.ok(blob?.count === total, 'single shared blob counter');

  process.env.GEMINI_RPM = prevRpm;
  process.env.GEMINI_RPD = prevRpd;

  console.log(
    `OK   global Gemini limit: ${instances} instances × ${perInstance} = ${total} acquires, max burst ${maxBurst}/${rpm} RPM, ${elapsed}ms`,
  );
}

async function testCasContentionNoOvercount() {
  const store = new MemoryBlobStore();
  const prevRpm = process.env.GEMINI_RPM;
  const prevRpd = process.env.GEMINI_RPD;
  process.env.GEMINI_RPM = '30';
  process.env.GEMINI_RPD = '50';

  await Promise.all(Array.from({ length: 25 }, () => acquire(store)));
  const usage = await readUsage(store);
  assert.equal(usage.count, 25, 'CAS should not double-count under contention');

  process.env.GEMINI_RPM = prevRpm;
  process.env.GEMINI_RPD = prevRpd;
  console.log('OK   CAS contention: 25 parallel acquires → count=25');
}

async function main() {
  await testCasContentionNoOvercount();
  await testCollectiveRpmLimit();
  console.log('\ngemini-rate-limit-global tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
