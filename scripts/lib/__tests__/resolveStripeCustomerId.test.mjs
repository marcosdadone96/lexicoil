/**
 * resolveStripeCustomerId — blob id, customer list, search API, subscription metadata.
 * Run: node scripts/lib/__tests__/resolveStripeCustomerId.test.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const {
  resolveStripeCustomerId,
  persistStripeCustomerId,
} = require(path.join(ROOT, 'netlify/functions/lib/stripeLib.js'));

const SECRET = 'sk_test_mock';
const EMAIL = 'marcos@example.com';

let passed = 0;
let failed = 0;
async function test(desc, fn) {
  try {
    await fn();
    console.log(`  ✅  ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${desc}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function makeStore(user = null) {
  const data = new Map();
  if (user) data.set(`user:${EMAIL}`, user);
  return {
    async get(key) {
      return data.get(key) ?? null;
    },
    async setJSON(key, val) {
      data.set(key, val);
    },
    _data: data,
  };
}

function mockStripe(responses) {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    const hit = responses.find((r) => {
      if (r.match === '/customers/list') return url.includes('/customers?') && !url.includes('/customers/search');
      return url.includes(r.match);
    });
    if (!hit) {
      return { ok: false, json: async () => ({ error: { message: 'unexpected ' + url } }) };
    }
    return { ok: true, json: async () => hit.body };
  };
  return calls;
}

const tests = [];

await test('uses stored stripeCustomerId without Stripe API', async () => {
  const store = makeStore({ name: 'Marcos', email: EMAIL, stripeCustomerId: 'cus_saved' });
  const calls = mockStripe([]);
  const id = await resolveStripeCustomerId(store, EMAIL, SECRET);
  assert.equal(id, 'cus_saved');
  assert.equal(calls.length, 0);
});

await test('falls back to customer list by email', async () => {
  const store = makeStore({ name: 'Marcos', email: EMAIL });
  mockStripe([{ match: '/customers/list', body: { data: [{ id: 'cus_list' }] } }]);
  const id = await resolveStripeCustomerId(store, EMAIL, SECRET);
  assert.equal(id, 'cus_list');
  const saved = await store.get(`user:${EMAIL}`);
  assert.equal(saved.stripeCustomerId, 'cus_list');
  assert.equal(saved.billingSource, 'stripe');
});

await test('falls back to customer search when list is empty', async () => {
  const store = makeStore({ name: 'Marcos', email: EMAIL });
  mockStripe([
    { match: '/customers/list', body: { data: [] } },
    { match: '/customers/search', body: { data: [{ id: 'cus_search' }] } },
  ]);
  const id = await resolveStripeCustomerId(store, EMAIL, SECRET);
  assert.equal(id, 'cus_search');
});

await test('falls back to subscription metadata email', async () => {
  const store = makeStore({ name: 'Marcos', email: EMAIL });
  mockStripe([
    { match: '/customers/list', body: { data: [] } },
    { match: '/customers/search', body: { data: [] } },
    {
      match: '/subscriptions/search',
      body: { data: [{ id: 'sub_1', customer: 'cus_sub_meta', status: 'active' }] },
    },
  ]);
  const id = await resolveStripeCustomerId(store, EMAIL, SECRET);
  assert.equal(id, 'cus_sub_meta');
});

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
