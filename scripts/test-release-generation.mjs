#!/usr/bin/env node
/**
 * Generation ticket release — refund when exam not delivered.
 * personal_exam → AI credits; exam_generation → monthly exam quota.
 *
 * Usage: node scripts/test-release-generation.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-secret-at-least-16-chars!!';

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
const quotaLibPath = path.join(ROOT, 'netlify/functions/lib/quotaLib.js');
const aiCreditsPath = path.join(ROOT, 'netlify/functions/lib/aiCredits.js');
const releasePath = path.join(ROOT, 'netlify/functions/lib/releaseGeneration.js');
const genTicketPath = path.join(ROOT, 'netlify/functions/lib/genTicket.js');

require(blobStorePath).getStoreForEvent = () => store;
for (const p of [quotaLibPath, aiCreditsPath, releasePath, genTicketPath]) delete require.cache[p];

const quotaLib = require(quotaLibPath);
const aiCredits = require(aiCreditsPath);
const { createGenTicket } = require(genTicketPath);
const {
  linkTicketQuotaCharge,
  releaseGenerationQuota,
  deliverGenerationQuota,
} = require(releasePath);
const { signAuthToken, userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));

const email = 'user@test.com';
const qKey = `quota:${email}`;
const month = quotaLib.getMonthKey();

await store.setJSON(userKey(email), {
  email,
  name: 'Test',
  plan: 'pro',
  tokenVersion: 1,
});
const { token: authToken } = signAuthToken(email, 'Test', 1);
const event = { headers: { authorization: `Bearer ${authToken}` } };

// ── personal_exam: AI credits (not monthly exam quota) ──
await store.setJSON(qKey, { used: 5, aiUsed: 0, aiMax: 100, month, version: 1 });

const quotaBeforePersonal = await quotaLib.checkQuota(event);
assert(quotaBeforePersonal.used === 5, 'personal_exam path does not touch exam quota used');

const aiCharge = await aiCredits.confirmAiCreditConsumption(event, 'personal_exam', {
  requestId: 'personal-nonce-1',
});
assert(aiCharge.aiUsed === 3, 'personal_exam charges 3 AI credits at start');

const sub = quotaBeforePersonal.state.email;
const { token: personalToken, payload: personalPayload } = createGenTicket(
  sub,
  'personal_exam',
  8,
  process.env.AUTH_JWT_SECRET,
);
// Simulate charge keyed to ticket nonce (startGeneration uses payload.nonce)
await aiCredits.releaseAiCreditConsumption(event, 'personal_exam', { requestId: 'personal-nonce-1' });
const aiCharge2 = await aiCredits.confirmAiCreditConsumption(event, 'personal_exam', {
  requestId: personalPayload.nonce,
});
assert(aiCharge2.aiUsed === 3, 'personal_exam ticket nonce charge ok');

const releasePersonal = await releaseGenerationQuota(event, { genTicket: personalToken });
assert(releasePersonal.released === true, 'personal_exam release returns released:true');
assert(releasePersonal.aiUsed === 0, 'AI credits refunded after failed personal exam');

const afterPersonalRelease = await store.get(qKey, { type: 'json' });
assert(afterPersonalRelease.aiUsed === 0, 'blob aiUsed is 0 after personal release');
assert(afterPersonalRelease.used === 5, 'monthly exam quota unchanged after personal release');

// Refund personal even when chunks were consumed
const aiCharge3 = await aiCredits.confirmAiCreditConsumption(event, 'personal_exam', {
  requestId: 'personal-nonce-chunks',
});
assert(aiCharge3.aiUsed === 3, 're-charge for chunk-failure test');
const { token: token2, payload: payload2 } = createGenTicket(
  sub,
  'personal_exam',
  8,
  process.env.AUTH_JWT_SECRET,
);
await aiCredits.releaseAiCreditConsumption(event, 'personal_exam', { requestId: 'personal-nonce-chunks' });
await aiCredits.confirmAiCreditConsumption(event, 'personal_exam', { requestId: payload2.nonce });
await store.setJSON(`gentk:${payload2.nonce}`, { chunksUsed: 5, maxChunks: 8, released: false });

const releaseAfterChunks = await releaseGenerationQuota(event, { genTicket: token2 });
assert(releaseAfterChunks.released === true, 'personal release refunds even when chunksUsed > 0');
const afterChunkRelease = await store.get(qKey, { type: 'json' });
assert(afterChunkRelease.aiUsed === 0, 'AI credits back to 0 after failed generation with chunks');

// Delivered personal exam cannot refund AI credits
await aiCredits.confirmAiCreditConsumption(event, 'personal_exam', { requestId: 'personal-nonce-deliver' });
const { token: token3, payload: payload3 } = createGenTicket(
  sub,
  'personal_exam',
  8,
  process.env.AUTH_JWT_SECRET,
);
await aiCredits.releaseAiCreditConsumption(event, 'personal_exam', { requestId: 'personal-nonce-deliver' });
await aiCredits.confirmAiCreditConsumption(event, 'personal_exam', { requestId: payload3.nonce });
await store.setJSON(`gentk:${payload3.nonce}`, { chunksUsed: 5, maxChunks: 8, released: false });

const deliveredPersonal = await deliverGenerationQuota(event, { genTicket: token3 });
assert(deliveredPersonal.delivered === true, 'deliverGeneration marks personal session delivered');

const releaseBlockedPersonal = await releaseGenerationQuota(event, { genTicket: token3 });
assert(releaseBlockedPersonal.released === false, 'personal release blocked after deliver');
assert(releaseBlockedPersonal.reason === 'already_delivered', 'reason is already_delivered');

const stillChargedAi = await store.get(qKey, { type: 'json' });
assert(stillChargedAi.aiUsed === 3, 'AI credits stay charged after successful personal delivery');
assert(stillChargedAi.used === 5, 'monthly exam quota still unchanged');

// ── exam_generation: monthly quota ──
await store.setJSON(qKey, { used: 0, aiUsed: 3, aiMax: 100, month, version: 10 });

const quotaCheck = await quotaLib.checkQuota(event);
assert(quotaCheck.ok, 'checkQuota ok for authenticated user');
const quotaMeta = await quotaLib.incrementQuota(quotaCheck);
assert(quotaMeta.used === 1, 'exam_generation reserves 1 monthly quota unit');

const { token, payload } = createGenTicket(sub, 'exam_generation', 8, process.env.AUTH_JWT_SECRET);
await linkTicketQuotaCharge(event, quotaCheck.state, payload.nonce, quotaMeta);

const release1 = await releaseGenerationQuota(event, { genTicket: token });
assert(release1.released === true, 'exam_generation release returns released:true');
assert(release1.used === 0, 'monthly quota drops to 0 after release');

const afterRelease = await quotaLib.checkQuota(event);
assert(afterRelease.used === 0, 'blob quota used is 0 after exam_generation release');
assert(afterRelease.state && (await store.get(qKey, { type: 'json' })).aiUsed === 3, 'AI credits untouched by exam_generation refund');

console.log('\nAll release-generation tests passed.');
