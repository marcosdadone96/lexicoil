#!/usr/bin/env node
/**
 * Tests personal pool quota gate for GET exam-part (?words=).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-secret-min-16-chars!!';
process.env.GUEST_IP_SALT = 'test-salt';

function makeMockStore() {
  const blobs = new Map();
  const etags = new Map();
  return {
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && blobs.has(key)) return { modified: false };
      if (opts.onlyIfMatch) {
        const current = etags.get(key);
        if (current && current !== opts.onlyIfMatch) return { modified: false };
      }
      blobs.set(key, JSON.parse(JSON.stringify(value)));
      etags.set(key, `etag-${blobs.size}`);
      return { modified: true };
    },
    async get(key, opts = {}) {
      const v = blobs.get(key) ?? null;
      if (opts.type === 'json' && v != null && typeof v !== 'object') return JSON.parse(v);
      return v;
    },
    async getWithMetadata(key, opts = {}) {
      const data = await this.get(key, opts);
      if (data == null) return null;
      return { data, etag: etags.get(key) || 'etag-0' };
    },
    async delete(key) {
      blobs.delete(key);
      etags.delete(key);
    },
    _clear() {
      blobs.clear();
      etags.clear();
    },
  };
}

const sharedStore = makeMockStore();

function installMockBlobStore() {
  const blobPath = path.join(ROOT, 'netlify/functions/lib/blobStore.js');
  require.cache[blobPath] = {
    id: blobPath,
    filename: blobPath,
    loaded: true,
    exports: {
      getStoreForEvent: () => sharedStore,
      STORE_NAME: 'lexicoil-data',
    },
  };
}

installMockBlobStore();

const { gatePersonalExamPartGet } = require(path.join(ROOT, 'netlify/functions/lib/examPartPersonalQuota.js'));
const { signAuthToken, userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const PersonalPoolQuota = require(path.join(ROOT, 'js/library/personalPoolQuota.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

function authEvent(token) {
  return {
    headers: { authorization: `Bearer ${token}` },
    httpMethod: 'GET',
  };
}

async function seedUser(email, plan = 'free') {
  await sharedStore.setJSON(userKey(email), {
    name: 'Test',
    email,
    plan,
    pro: false,
    passwordHash: 'x',
    tokenVersion: 1,
    emailVerified: true,
  });
}

async function seedQuotaExhausted(email) {
  const qKey = `quota:${email}`;
  const max = PersonalPoolQuota.maxFor('free', 'lesen');
  await sharedStore.setJSON(qKey, {
    personalLesenUsed: max,
    personalHorenUsed: 0,
    month: new Date().toISOString().slice(0, 7),
  });
}

async function run() {
  const email = 'quota@test.com';
  sharedStore._clear();
  await seedUser(email);
  const session = signAuthToken(email, 'Test', 1);
  const event = authEvent(session.token);
  const requestId = crypto.randomUUID();

  const publicGate = await gatePersonalExamPartGet(event, sharedStore, {
    module: 'lesen',
    poolRequestId: requestId,
    wordsPresent: false,
  });
  assert('public mode skips auth/quota', publicGate.ok && publicGate.public === true);

  const noAuth = await gatePersonalExamPartGet(
    { headers: {}, httpMethod: 'GET' },
    sharedStore,
    { module: 'lesen', poolRequestId: requestId, wordsPresent: true },
  );
  assert('words without auth → login_required', !noAuth.ok && noAuth.error === 'login_required');

  await seedQuotaExhausted(email);
  const exhausted = await gatePersonalExamPartGet(event, sharedStore, {
    module: 'lesen',
    poolRequestId: crypto.randomUUID(),
    wordsPresent: true,
  });
  assert('words with exhausted quota → 429', !exhausted.ok && exhausted.error === 'personal_pool_quota_exceeded');

  sharedStore._clear();
  await seedUser(email);
  const rid = crypto.randomUUID();
  const first = await gatePersonalExamPartGet(event, sharedStore, {
    module: 'lesen',
    poolRequestId: rid,
    wordsPresent: true,
  });
  assert('words with quota → allowed', first.ok && first.poolModule === 'lesen');
  assert('first request increments used', first.quotaMeta?.used === 1);

  const second = await gatePersonalExamPartGet(event, sharedStore, {
    module: 'lesen',
    poolRequestId: rid,
    wordsPresent: true,
  });
  assert('same poolRequestId is idempotent', second.ok && second.quotaMeta?.used === 1);

  sharedStore._clear();
  await seedUser(email);
  const noRid = await gatePersonalExamPartGet(event, sharedStore, {
    module: 'lesen',
    poolRequestId: '',
    wordsPresent: true,
  });
  assert('words without poolRequestId → 400', !noRid.ok && noRid.error === 'pool_request_id_required');

  console.log('\nAll exam-part personal quota tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
