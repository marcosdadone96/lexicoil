#!/usr/bin/env node
/**
 * Stripe charge.refunded → revokeProForEmail (mock store).
 * Run: node scripts/test-stripe-refund-webhook.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

const store = new Map();
function mockStore() {
  return {
    async get(key, opts) {
      const v = store.get(key);
      if (!v) return null;
      return opts?.type === 'json' ? JSON.parse(v) : v;
    },
    async setJSON(key, val) {
      store.set(key, JSON.stringify(val));
      return { modified: true };
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

const { userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const { revokeProForEmail } = require(path.join(ROOT, 'netlify/functions/lib/proUpgrade.js'));
const { clampPersonalPoolCounters } = require(path.join(ROOT, 'netlify/functions/lib/downgradeQuota.js'));

const EMAIL = 'refund@test.com';
const ms = mockStore();

store.set(userKey(EMAIL), JSON.stringify({
  email: EMAIL,
  name: 'Refund Test',
  plan: 'pro',
  pro: true,
}));
store.set(`quota:${EMAIL}`, JSON.stringify({
  month: '2026-07',
  personalLesenUsed: 25,
  personalHorenUsed: 20,
  aiMax: 40,
}));

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    passed++;
    console.log('OK  ', msg);
  } else {
    failed++;
    console.error('FAIL', msg);
  }
}

const result = await revokeProForEmail(ms, EMAIL, { reason: 'charge_refunded' });
ok(result.ok, 'revokeProForEmail ok');
const user = JSON.parse(store.get(userKey(EMAIL)));
ok(user.plan === 'free' && !user.pro, 'user downgraded to free');
ok(user.proRevokeReason === 'charge_refunded', 'reason stored');

const quota = JSON.parse(store.get(`quota:${EMAIL}`));
ok(quota.personalLesenUsed <= 8, `lesen clamped to free max (${quota.personalLesenUsed})`);
ok(quota.personalHorenUsed <= 8, `horen clamped to free max (${quota.personalHorenUsed})`);

const clampOnly = clampPersonalPoolCounters(
  { month: '2026-07', personalLesenUsed: 60, personalHorenUsed: 55 },
  'free',
  '2026-07',
);
ok(clampOnly.personalLesenUsed === 8, 'clamp helper lesen 60→8');
ok(clampOnly.personalHorenUsed === 8, 'clamp helper horen 55→8');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
