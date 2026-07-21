#!/usr/bin/env node
/**
 * Tests registration IP rate limit (5 / 24h).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-secret-min-16-chars!!';
process.env.GUEST_IP_SALT = 'test-salt';
process.env.AUTH_SKIP_EMAIL_VERIFY = '1';

const { checkIpRateLimit, recordIpRateLimitHit } = require(path.join(ROOT, 'netlify/functions/lib/ipRateLimit.js'));

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
    async setJSON(key, value) {
      blobs.set(key, JSON.parse(JSON.stringify(value)));
    },
    async get(key, opts = {}) {
      const v = blobs.get(key) ?? null;
      if (opts.type === 'json' && v != null && typeof v !== 'object') return JSON.parse(v);
      return v;
    },
  };
}

const event = {
  headers: { 'x-forwarded-for': '203.0.113.50' },
};

async function run() {
  const store = makeMockStore();
  const limit = 5;
  const windowMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < limit; i += 1) {
    const rl = await checkIpRateLimit(store, event, 'ratelimit_register', { limit, windowMs });
    assert(`registration ${i + 1} allowed`, rl.ok);
    await recordIpRateLimitHit(store, { ...rl, windowMs });
  }

  const blocked = await checkIpRateLimit(store, event, 'ratelimit_register', { limit, windowMs });
  assert('6th registration blocked', !blocked.ok);

  const otherIp = {
    headers: { 'x-forwarded-for': '203.0.113.99' },
  };
  const other = await checkIpRateLimit(store, otherIp, 'ratelimit_register', { limit, windowMs });
  assert('different IP still allowed', other.ok);

  console.log('\nAll auth register rate-limit tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
