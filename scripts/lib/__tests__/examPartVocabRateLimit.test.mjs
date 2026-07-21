/**
 * Via A (exam-part ?words=) rate-limit tests.
 * Run: node scripts/lib/__tests__/examPartVocabRateLimit.test.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const {
  checkExamPartVocabRateLimit,
  VOCAB_PICK_LIMIT,
  VOCAB_PICK_WINDOW_MS,
} = require(path.join(ROOT, 'netlify/functions/lib/examPartVocabRateLimit.js'));

let passed = 0;
let failed = 0;
function test(desc, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✅  ${desc}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ❌  ${desc}`);
      console.error(`     ${err.message}`);
      failed++;
    });
}

function memoryStore() {
  const map = new Map();
  return {
    async get(key, opts) {
      if (opts?.type === 'json') return map.has(key) ? structuredClone(map.get(key)) : null;
      return map.get(key) ?? null;
    },
    async setJSON(key, val) {
      map.set(key, structuredClone(val));
    },
    _map: map,
  };
}

function fakeEvent(ip = '203.0.113.10') {
  return { headers: { 'x-forwarded-for': ip } };
}

console.log('\n── exam-part Via A vocab rate limit ──');
console.log(`     limit=${VOCAB_PICK_LIMIT} / ${VOCAB_PICK_WINDOW_MS}ms`);

await test('normal use: 5 sequential vocab picks allowed', async () => {
  const store = memoryStore();
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) {
    const r = await checkExamPartVocabRateLimit(store, fakeEvent(), {
      limit: 60,
      windowMs: 60_000,
      now: t0 + i * 10,
    });
    assert.equal(r.ok, true, `pick ${i + 1} should pass`);
  }
});

await test('normal burst: 20 picks in a few seconds still OK under 60/min', async () => {
  const store = memoryStore();
  const t0 = 2_000_000;
  for (let i = 0; i < 20; i++) {
    const r = await checkExamPartVocabRateLimit(store, fakeEvent('198.51.100.1'), {
      limit: 60,
      windowMs: 60_000,
      now: t0 + i,
    });
    assert.equal(r.ok, true, `burst pick ${i + 1}`);
  }
});

await test('abuse: 61st pick in same minute is blocked', async () => {
  const store = memoryStore();
  const t0 = 3_000_000;
  const ip = '198.51.100.99';
  for (let i = 0; i < 60; i++) {
    const r = await checkExamPartVocabRateLimit(store, fakeEvent(ip), {
      limit: 60,
      windowMs: 60_000,
      now: t0 + i,
    });
    assert.equal(r.ok, true);
  }
  const blocked = await checkExamPartVocabRateLimit(store, fakeEvent(ip), {
    limit: 60,
    windowMs: 60_000,
    now: t0 + 60,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
});

await test('window reset: after windowMs, picks allowed again', async () => {
  const store = memoryStore();
  const t0 = 4_000_000;
  const ip = '203.0.113.55';
  for (let i = 0; i < 60; i++) {
    await checkExamPartVocabRateLimit(store, fakeEvent(ip), {
      limit: 60,
      windowMs: 60_000,
      now: t0,
    });
  }
  const stillBlocked = await checkExamPartVocabRateLimit(store, fakeEvent(ip), {
    limit: 60,
    windowMs: 60_000,
    now: t0 + 30_000,
  });
  assert.equal(stillBlocked.ok, false);
  const afterReset = await checkExamPartVocabRateLimit(store, fakeEvent(ip), {
    limit: 60,
    windowMs: 60_000,
    now: t0 + 60_001,
  });
  assert.equal(afterReset.ok, true);
});

await test('different IPs do not share the same bucket', async () => {
  const store = memoryStore();
  const t0 = 5_000_000;
  for (let i = 0; i < 60; i++) {
    await checkExamPartVocabRateLimit(store, fakeEvent('10.0.0.1'), {
      limit: 60,
      windowMs: 60_000,
      now: t0,
    });
  }
  const other = await checkExamPartVocabRateLimit(store, fakeEvent('10.0.0.2'), {
    limit: 60,
    windowMs: 60_000,
    now: t0,
  });
  assert.equal(other.ok, true);
});

await test('no store → fail-open (ok)', async () => {
  const r = await checkExamPartVocabRateLimit(null, fakeEvent(), { limit: 1, windowMs: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
});

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
