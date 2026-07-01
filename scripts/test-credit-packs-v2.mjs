#!/usr/bin/env node
/**
 * Credit packs v2: S/M/L pricing, topup persistence, wall order, idempotency.
 * Includes LEGACY_SNAPSHOT of 50/150/400 packs before 2026-06 realignment.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.AI_CREDITS_PRO = '40';
process.env.AI_CREDITS_ROLLOVER_CAP = '50';

const {
  CREDIT_PACKS,
  PACK_META,
  LEGACY_PACK_MAP,
  PRO_PRICE_PER_CREDIT,
  normalizeCreditPack,
  packMoreExpensiveThanProSubscription,
  exhaustedWallActions,
  listCreditPackOffers,
} = require(path.join(ROOT, 'netlify/functions/lib/creditPacksLib.js'));
const {
  applyMonthlyAiReset,
  computeAiRemaining,
  deductAiCost,
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

  async get(key, opts) {
    const row = await this.getWithMetadata(key);
    if (!row) return null;
    if (opts?.type === 'json') return row.data;
    return row.data;
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

function pass(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (cond) passed++;
  else {
    failed++;
    process.exitCode = 1;
  }
}

const LEGACY_SNAPSHOT = Object.freeze({
  packs: { 50: 50, 150: 150, 400: 400 },
  pricesEur: { 50: 3.99, 150: 8.99, 400: 19.99 },
});
pass('legacy snapshot had 50/150/400 packs', LEGACY_SNAPSHOT.packs[50] === 50);

console.log('\n── Pack catalog ──');
pass('CREDIT_PACKS S=15', CREDIT_PACKS[15] === 15);
pass('CREDIT_PACKS M=40', CREDIT_PACKS[40] === 40);
pass('CREDIT_PACKS L=100', CREDIT_PACKS[100] === 100);
pass('S price €6', PACK_META[15].priceEur === 6);
pass('M price €14', PACK_META[40].priceEur === 14);
pass('L price €100 credits €30', PACK_META[100].priceEur === 30);
pass('Pro sub €/cr ≈ 0.325', Math.abs(PRO_PRICE_PER_CREDIT - 13 / 40) < 0.001);
pass('S more expensive/cr than Pro', packMoreExpensiveThanProSubscription(15));
pass('M more expensive/cr than Pro', packMoreExpensiveThanProSubscription(40));
pass('L catalog €0.30/cr', PACK_META[100].pricePerCredit === 0.3);
pass('listCreditPackOffers has 3', listCreditPackOffers().length === 3);

console.log('\n── Legacy pack mapping ──');
pass('50 → 40', normalizeCreditPack(50) === 40);
pass('150 → 100', normalizeCreditPack(150) === 100);
pass('400 → 100', normalizeCreditPack(400) === 100);
pass('LEGACY_PACK_MAP documents 50→40', LEGACY_PACK_MAP[50] === 40);

console.log('\n── Topups never expire on month rollover ──');
{
  const month = getMonthKey();
  const prev = '1999-01';
  const rec = applyMonthlyAiReset(
    { month: prev, aiUsed: 6, aiMax: 6, creditTopups: 10, rollover: 0, overdraft: 0, used: 2 },
    6,
    month,
  );
  pass('topups preserved after month change', rec.creditTopups === 10);
  pass('free monthly pool reset (aiUsed from overdraft only)', rec.aiUsed === 0);
}

console.log('\n── Spend monthly first, then topups ──');
{
  const month = getMonthKey();
  let rec = applyMonthlyAiReset(
    { month, aiUsed: 6, aiMax: 6, creditTopups: 10, rollover: 0, used: 0 },
    6,
    month,
  );
  pass('0 monthly + 10 topups → remaining 10', computeAiRemaining(rec) === 10);
  rec = deductAiCost(rec, 10);
  pass('spent 10 from topups', rec.creditTopups === 0 && rec.aiUsed === 6);
}

console.log('\n── Topups survive even when aiMax was 0 in old bug path ──');
{
  const month = getMonthKey();
  const rec = applyMonthlyAiReset(
    { month: '1999-05', aiUsed: 0, aiMax: 0, creditTopups: 25, rollover: 0 },
    0,
    month,
  );
  pass('topups kept when aiMax=0', rec.creditTopups === 25);
}

console.log('\n── Exhausted wall order by plan ──');
{
  const free = exhaustedWallActions('free');
  pass('free: upgrade primary, no packs', free.primary === 'upgrade_pro' && !free.showPacks);
  const pro = exhaustedWallActions('pro');
  pass('pro: upgrade Pro Max primary, packs secondary', pro.primary === 'upgrade_pro_max' && pro.showPacks);
  const max = exhaustedWallActions('pro_max');
  pass('pro_max: packs only', max.primary === 'buy_pack' && max.showPacks);
}

console.log('\n── Webhook idempotency credit_pack:<id> ──');
{
  const store = new MemoryBlobStore();
  const email = 'pack-v2@test.com';
  await store.setJSON(`user:${email}`, { email, plan: 'pro', pro: true });
  const r1 = await addCreditTopups(store, email, 15, 'evt_pack_abc');
  const r2 = await addCreditTopups(store, email, 15, 'evt_pack_abc');
  pass('first add 15 ok', r1.ok && r1.creditTopups === 15);
  pass('duplicate webhook skipped', r2.duplicate === true);
  const blob = await store.get(`quota:${email}`, { type: 'json' });
  pass('topups only added once', blob.creditTopups === 15);
}

console.log(`\nCredit packs v2: ${passed} passed, ${failed} failed\n`);
