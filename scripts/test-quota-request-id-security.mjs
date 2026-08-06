#!/usr/bin/env node
/**
 * Security: requestId idempotency + generation ticket owner binding.
 *   node scripts/test-quota-request-id-security.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-secret-at-least-16-chars!!';
process.env.AI_CREDITS_PRO = '100';

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

  async get(key, opts = {}) {
    const row = await this.getWithMetadata(key);
    const data = row?.data ?? null;
    if (opts.type === 'json' && typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
    return data;
  }

  async setJSON(key, data, opts = {}) {
    const existing = this.blobs.get(key);
    if (opts.onlyIfNew && existing) return { modified: false };
    if (opts.onlyIfMatch && (!existing || existing.etag !== opts.onlyIfMatch)) {
      return { modified: false };
    }
    this.etagSeq += 1;
    this.blobs.set(key, { data: structuredClone(data), etag: `e${this.etagSeq}` });
    return { modified: true };
  }

  async delete(key) {
    this.blobs.delete(key);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const store = new MemoryBlobStore();
const blobStorePath = path.join(ROOT, 'netlify/functions/lib/blobStore.js');
require(blobStorePath).getStoreForEvent = () => store;

const quotaLib = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js'));
const aiCredits = require(path.join(ROOT, 'netlify/functions/lib/aiCredits.js'));
const { parseRequestId } = require(path.join(ROOT, 'netlify/functions/lib/requestId.js'));
const { createGenTicket } = require(path.join(ROOT, 'netlify/functions/lib/genTicket.js'));
const {
  assertGenerationTicketOwner,
  releaseGenerationQuota,
} = require(path.join(ROOT, 'netlify/functions/lib/releaseGeneration.js'));
const { signAuthToken, userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));

const month = quotaLib.getMonthKey();
const userA = 'owner@test.com';
const userB = 'other@test.com';
const qKeyA = `quota:${userA}`;

await store.setJSON(userKey(userA), { email: userA, name: 'A', plan: 'pro', tokenVersion: 1 });
await store.setJSON(userKey(userB), { email: userB, name: 'B', plan: 'pro', tokenVersion: 1 });
await store.setJSON(qKeyA, { used: 0, aiUsed: 0, aiMax: 100, month, version: 1 });
await store.setJSON(`quota:${userB}`, { used: 0, aiUsed: 0, aiMax: 100, month, version: 1 });

const { token: tokenA } = signAuthToken(userA, 'A', 1);
const { token: tokenB } = signAuthToken(userB, 'B', 1);
const eventA = { headers: { authorization: `Bearer ${tokenA}` } };
const eventB = { headers: { authorization: `Bearer ${tokenB}` } };

{
  const check = await quotaLib.checkQuota(eventA);
  const r1 = await quotaLib.incrementQuota(check, { requestId: null });
  const r2 = await quotaLib.incrementQuota(check, { requestId: null });
  assert(r1.used === 1 && r2.used === 2, 'without requestId retry doubles exam quota (blocked at API now)');

  const rid = 'exam-start-retry-1';
  const c2 = await quotaLib.checkQuota(eventA);
  const i1 = await quotaLib.incrementQuota(c2, { requestId: rid });
  const i2 = await quotaLib.incrementQuota(c2, { requestId: rid });
  assert(i1.used === i2.used && i2.used === 3, 'same requestId is idempotent for exam quota');
  assert(parseRequestId('') === null && parseRequestId('  ') === null, 'parseRequestId rejects empty');
}

{
  await store.setJSON(qKeyA, { used: 3, aiUsed: 10, aiMax: 100, month, version: 1 });
  const r1 = await aiCredits.confirmAiCreditConsumption(eventA, 'tts', { requestId: null });
  const r2 = await aiCredits.confirmAiCreditConsumption(eventA, 'tts', { requestId: null });
  assert(!r1?.error && !r2?.error && r2.aiUsed === r1.aiUsed + 1, 'without requestId TTS retry doubles AI charge');

  const rid = 'tts-post-retry-1';
  const t1 = await aiCredits.confirmAiCreditConsumption(eventA, 'tts', { requestId: rid });
  const t2 = await aiCredits.confirmAiCreditConsumption(eventA, 'tts', { requestId: rid });
  assert(t1.aiUsed === t2.aiUsed, 'same requestId idempotent for TTS AI credits');
}

{
  const secret = process.env.AUTH_JWT_SECRET;
  const { token, payload } = createGenTicket(userA, 'exam_generation', 3, secret);
  const okOwner = await assertGenerationTicketOwner(eventA, payload);
  assert(okOwner.ok === true, 'ticket owner matches on examGeneration path');

  const stolen = await assertGenerationTicketOwner(eventB, payload);
  assert(stolen.ok === false && stolen.error === 'ticket_owner_mismatch', 'stolen ticket rejected for other user');

  await quotaLib.incrementQuota(await quotaLib.checkQuota(eventA), { requestId: payload.nonce });
  await store.setJSON(`gentk:${payload.nonce}`, { chunksUsed: 0, maxChunks: 3 });
  const relStolen = await releaseGenerationQuota(eventB, { genTicket: token });
  assert(relStolen.released === false && relStolen.reason === 'ticket_owner_mismatch', 'release also rejects stolen ticket');
}

console.log('\nAll quota/requestId security checks passed.');
