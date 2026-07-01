#!/usr/bin/env node
/**
 * submit-feedback validation, rate limit, and handler (mocked Supabase + blob store).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-feedback-secret-32chars!!';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

function memoryStore() {
  const data = {};
  return {
    async get(key, { type } = {}) {
      if (!(key in data)) throw new Error('missing');
      return type === 'json' ? data[key] : data[key];
    },
    async setJSON(key, val) {
      data[key] = val;
    },
  };
}

let activeStore = memoryStore();
const blobPath = path.join(ROOT, 'netlify/functions/lib/blobStore.js');
require(blobPath).getStoreForEvent = () => activeStore;

const feedbackLib = require(path.join(ROOT, 'netlify/functions/lib/feedbackLib.js'));
const { signAuthToken } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));

assert.equal(feedbackLib.validateFeedbackPayload({ message: '' }).error, 'message_too_short');
assert.equal(feedbackLib.validateFeedbackPayload({ message: 'hi' }).error, 'message_too_short');
assert.equal(feedbackLib.validateFeedbackPayload({ message: 'x'.repeat(2001) }).error, 'message_too_long');
assert.ok(feedbackLib.validateFeedbackPayload({ message: 'Great app, love the flashcards!' }).ok);

const spamLinks = 'Check ' + 'https://spam.com '.repeat(4);
assert.equal(feedbackLib.validateFeedbackPayload({ message: spamLinks }).error, 'too_many_links');

async function rateLimitAllows(store, n, opts) {
  activeStore = store;
  for (let i = 0; i < n; i++) {
    const ok = await feedbackLib.checkFeedbackRateLimit(store, opts);
    if (!ok) return i;
  }
  return n;
}

{
  const store = memoryStore();
  const opts = { ipKey: 'ip:test', userKey: null };
  const passed = await rateLimitAllows(store, 5, opts);
  assert.equal(passed, 5, 'allows 5 per hour');
  const sixth = await feedbackLib.checkFeedbackRateLimit(store, opts);
  assert.equal(sixth, false, 'blocks 6th submission');
}

const inserts = [];
const sb = require(path.join(ROOT, 'netlify/functions/lib/supabaseAdmin.js'));
const origInsert = sb.insertFeedback;
const origConfigured = sb.isConfigured;

sb.insertFeedback = async (row) => {
  inserts.push(row);
  return 'fb-test-id';
};
sb.isConfigured = () => true;

const handler = require(path.join(ROOT, 'netlify/functions/submit-feedback.js')).handler;

function makeEvent(body, { token, ip = '203.0.113.10' } = {}) {
  const headers = {
    'content-type': 'application/json',
    'x-forwarded-for': ip,
  };
  if (token) headers.cookie = `lc_token=${encodeURIComponent(token)}`;
  return {
    httpMethod: 'POST',
    headers,
    body: JSON.stringify(body),
  };
}

async function run() {
  activeStore = memoryStore();
  inserts.length = 0;
  const guestRes = await handler(
    makeEvent({ message: 'Guest feedback: clearer exam timer please.', page: 'homeScreen' }),
  );
  assert.equal(guestRes.statusCode, 200, 'guest submit 200');
  assert.equal(inserts.length, 1, 'guest insert');
  assert.equal(inserts[0].user_id, null, 'guest user_id null');
  assert.match(inserts[0].message, /Guest feedback/);

  activeStore = memoryStore();
  inserts.length = 0;
  const signed = signAuthToken('user@example.com', 'Test User');
  const authedRes = await handler(
    makeEvent(
      { message: 'Logged-in feedback: more B2 content please.', email: 'user@example.com' },
      { token: signed.token },
    ),
  );
  assert.equal(authedRes.statusCode, 200, 'logged-in submit 200');
  assert.equal(inserts.length, 1, 'logged-in insert');
  assert.ok(inserts[0].user_id, 'logged-in user_id set');
  assert.equal(inserts[0].email, 'user@example.com');

  activeStore = memoryStore();
  const emptyRes = await handler(makeEvent({ message: '   ' }, { ip: '203.0.113.99' }));
  assert.equal(emptyRes.statusCode, 400, 'empty message rejected');
  const emptyBody = JSON.parse(emptyRes.body);
  assert.equal(emptyBody.error, 'message_too_short');

  activeStore = memoryStore();
  const ip = '198.51.100.44';
  for (let i = 0; i < 5; i++) {
    const r = await handler(
      makeEvent({ message: `Rate test message number ${i + 1} ok.` }, { ip }),
    );
    assert.equal(r.statusCode, 200, `rate test ${i + 1}`);
  }
  const limited = await handler(
    makeEvent({ message: 'Rate test message number six blocked.' }, { ip }),
  );
  assert.equal(limited.statusCode, 429, 'rate limit 429');
  assert.equal(JSON.parse(limited.body).error, 'rate_limited');

  sb.insertFeedback = origInsert;
  sb.isConfigured = origConfigured;

  console.log('OK   submit-feedback validation, guest/auth insert, rate limit');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
