#!/usr/bin/env node
/**
 * Token revocation: old JWT rejected after tokenVersion bump.
 * Simulates claude-chat startGeneration path (checkQuota gate, no Anthropic call).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.AUTH_JWT_SECRET = 'test-secret-at-least-16-chars!!';
process.env.ANTHROPIC_API_KEY = 'test-key-not-used';

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

  async get(key, { type } = {}) {
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

function assert(label, cond, detail) {
  if (cond) {
    console.log('  OK:', label);
    return true;
  }
  console.error('FAIL:', label, detail ? `— ${detail}` : '');
  return false;
}

const store = new MemoryBlobStore();
const email = 'revoke@test.com';

const blobStorePath = path.join(ROOT, 'netlify/functions/lib/blobStore.js');
const quotaLibPath = path.join(ROOT, 'netlify/functions/lib/quotaLib.js');
const authLibPath = path.join(ROOT, 'netlify/functions/lib/authLib.js');
const claudeChatPath = path.join(ROOT, 'netlify/functions/claude-chat.js');

for (const p of [blobStorePath, quotaLibPath, authLibPath, claudeChatPath]) {
  delete require.cache[p];
}

const blobStore = require(blobStorePath);
blobStore.getStoreForEvent = () => store;

const { signAuthToken, userKey, requireAuth } = require(authLibPath);
const { checkQuota } = require(quotaLibPath);
const { handler: claudeHandler } = require(claudeChatPath);

const { token } = signAuthToken(email, 'Revoke Test', 1);
const userKeyStr = userKey(email);

await store.setJSON(userKeyStr, {
  name: 'Revoke Test',
  email,
  plan: 'free',
  pro: false,
  tokenVersion: 1,
  createdAt: Date.now(),
});

function makeEvent(body = {}) {
  return {
    httpMethod: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      origin: 'http://localhost:8888',
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

let passed = 0;
let failed = 0;

function check(label, cond, detail) {
  if (assert(label, cond, detail)) passed++;
  else failed++;
}

console.log('\n[1] requireAuth accepts token when tokenVersion matches');
{
  const auth = await requireAuth(makeEvent(), store);
  check('requireAuth ok', auth.ok === true);
  check('email matches', auth.email === email);
}

console.log('\n[2] Bump tokenVersion — old token rejected by requireAuth');
{
  await store.setJSON(userKeyStr, {
    name: 'Revoke Test',
    email,
    plan: 'free',
    pro: false,
    tokenVersion: 2,
    createdAt: Date.now(),
  });
  const auth = await requireAuth(makeEvent(), store);
  check('requireAuth fails', auth.ok === false);
  check('status 401', auth.status === 401);
  check('error token_revoked', auth.error === 'token_revoked');
}

console.log('\n[3] checkQuota returns token_revoked for stale token');
{
  const quota = await checkQuota(makeEvent());
  check('checkQuota fails', quota.ok === false);
  check('status 401', quota.status === 401);
  check('error token_revoked', quota.error === 'token_revoked');
}

console.log('\n[4] claude-chat startGeneration rejects stale token with 401');
{
  const res = await claudeHandler(
    makeEvent({ startGeneration: true, scope: 'exam_generation', maxChunks: 4 }),
  );
  let body = {};
  try {
    body = JSON.parse(res.body || '{}');
  } catch (_) {
    body = {};
  }
  check('HTTP 401', res.statusCode === 401, `got ${res.statusCode}`);
  check('error token_revoked', body.error === 'token_revoked', JSON.stringify(body));
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
