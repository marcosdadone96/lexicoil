#!/usr/bin/env node
/**
 * AI credit packs: consumption order, rollover, webhook idempotency, courtesy buffer.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.AI_CREDITS_PRO = '100';
process.env.AI_CREDITS_ROLLOVER_CAP = '50';
process.env.AI_CREDITS_OVERDRAFT_MAX = '5';

const {
  applyMonthlyAiReset,
  computeAiRemaining,
  canAffordAiCost,
  deductAiCost,
  applyCourtesyOverdraft,
} = require(path.join(ROOT, 'netlify/functions/lib/aiQuotaState.js'));
const { getMonthKey } = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js'));
const { addCreditTopups } = require(path.join(ROOT, 'netlify/functions/lib/aiCredits.js'));

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
}

let passed = 0;
let failed = 0;

function check(label, cond) {
  if (cond) {
    console.log('  OK:', label);
    passed++;
  } else {
    console.error('FAIL:', label);
    failed++;
  }
}

const month = getMonthKey();
const aiMax = 100;

console.log('\n[a] Consumption order: monthly → rollover → topups');
{
  let rec = applyMonthlyAiReset(
    { month, aiUsed: 98, aiMax, rollover: 10, creditTopups: 20, used: 0 },
    aiMax,
    month,
  );
  rec = deductAiCost(rec, 5);
  check('uses 2 monthly + 3 rollover', rec.aiUsed === 100 && rec.rollover === 7);
  rec = deductAiCost(rec, 10);
  check('then rollover then topups', rec.rollover === 0 && rec.creditTopups === 17);
}

console.log('\n[b] Month rollover: min(50, leftover), keep topups, overdraft → aiUsed');
{
  const prevMonth = '1999-01';
  const rec = applyMonthlyAiReset(
    {
      month: prevMonth,
      aiUsed: 80,
      aiMax: 100,
      rollover: 5,
      creditTopups: 30,
      overdraft: 3,
      used: 4,
    },
    aiMax,
    month,
  );
  check('rollover = min(50, 20) = 20', rec.rollover === 20);
  check('creditTopups preserved', rec.creditTopups === 30);
  check('aiUsed = previous overdraft', rec.aiUsed === 3);
  check('overdraft cleared', rec.overdraft === 0);
  check('exam used reset', rec.used === 0);
  check('remaining includes pools', computeAiRemaining(rec) === 147);
}

console.log('\n[c] Webhook credit_pack idempotent');
{
  const store = new MemoryBlobStore();
  const email = 'pack@test.com';
  const r1 = await addCreditTopups(store, email, 50, 'evt_123');
  const r2 = await addCreditTopups(store, email, 50, 'evt_123');
  check('first add ok', r1.ok && r1.creditTopups === 50);
  check('duplicate skipped extra', r2.duplicate === true);
  const blob = await store.get(`quota:${email}`);
  check('topups only 50 once', blob.creditTopups === 50);
}

console.log('\n[d] Courtesy buffer once per cycle');
{
  let rec = applyMonthlyAiReset(
    { month, aiUsed: 100, aiMax, rollover: 0, creditTopups: 0, overdraft: 0 },
    aiMax,
    month,
  );
  const afford = canAffordAiCost(rec, 3);
  check('cushion allows cost 3 when remaining 0', afford.ok && afford.useOverdraft);
  rec = applyCourtesyOverdraft(rec, 3);
  check('overdraft recorded', rec.overdraft === 3);
  check('pools emptied', rec.rollover === 0 && rec.creditTopups === 0 && rec.aiUsed === 100);
  const deny = canAffordAiCost(rec, 1);
  check('second request denied while overdraft>0', !deny.ok);
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
