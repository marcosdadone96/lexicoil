#!/usr/bin/env node
/**
 * AI credit charge/refund idempotency after failed Pro AI calls.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
    this.blobs.set(key, { data: structuredClone(data), etag: `e${this.etagSeq}` });
    return { modified: true };
  }

  async delete(key) {
    this.blobs.delete(key);
  }
}

const store = new MemoryBlobStore();
const email = 'pro@test.com';
const qKey = `quota:${email}`;
const month = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js')).getMonthKey();
const event = { headers: {} };

const quotaLibPath = path.join(ROOT, 'netlify/functions/lib/quotaLib.js');
const quotaLib = require(quotaLibPath);
const origGetQuotaState = quotaLib.getQuotaState;
quotaLib.getQuotaState = async () => ({
  ok: true,
  authenticated: true,
  email,
  plan: 'pro',
  used: 0,
  max: 12,
  month,
  store,
  qKey,
});

const {
  confirmAiCreditConsumption,
  releaseAiCreditConsumption,
} = require(path.join(ROOT, 'netlify/functions/lib/aiCredits.js'));

await store.setJSON(qKey, {
  used: 0,
  aiUsed: 10,
  aiMax: 100,
  month,
  rollover: 5,
  creditTopups: 0,
  overdraft: 0,
  version: 1,
});

const requestId = 'writing-retry-1';
const charged = await confirmAiCreditConsumption(event, 'writing_correction', { requestId });
if (charged.error || charged.remaining !== 94) {
  console.error('FAIL: charge writing_correction', charged);
  process.exit(1);
}

const blobAfterCharge = await store.get(qKey, { type: 'json' });
if (blobAfterCharge.aiUsed !== 11) {
  console.error('FAIL: aiUsed after charge expected 11 got', blobAfterCharge.aiUsed);
  process.exit(1);
}

const refunded = await releaseAiCreditConsumption(event, 'writing_correction', { requestId });
if (!refunded?.refunded || refunded.remaining !== 95) {
  console.error('FAIL: refund writing_correction', refunded);
  process.exit(1);
}

const blobAfterRefund = await store.get(qKey, { type: 'json' });
if (blobAfterRefund.aiUsed !== 10 || blobAfterRefund.rollover !== 5) {
  console.error('FAIL: pools not restored', blobAfterRefund);
  process.exit(1);
}

const refundedAgain = await releaseAiCreditConsumption(event, 'writing_correction', { requestId });
if (!refundedAgain?.refunded) {
  console.error('FAIL: refund idempotency', refundedAgain);
  process.exit(1);
}

if (blobAfterRefund.aiUsed !== (await store.get(qKey, { type: 'json' })).aiUsed) {
  console.error('FAIL: double refund mutated balance');
  process.exit(1);
}

const recharged = await confirmAiCreditConsumption(event, 'writing_correction', { requestId });
if (recharged.remaining !== 94) {
  console.error('FAIL: re-charge after refund', recharged);
  process.exit(1);
}

quotaLib.getQuotaState = origGetQuotaState;

console.log('OK   AI credit charge/refund idempotency');
console.log('All AI credit refund tests passed.');
