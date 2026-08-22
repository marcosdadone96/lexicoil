#!/usr/bin/env node
/**
 * Account deletion — unit test with in-memory blob store mock.
 * Run: node scripts/test-account-delete.mjs
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
    async list({ prefix }) {
      const blobs = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((k) => ({ key: k }));
      return { blobs, hasMore: false };
    },
  };
}

const { userKey, syncKey, emailToUserId } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const {
  verifyDeleteConfirmation,
  deleteUserBlobs,
} = require(path.join(ROOT, 'netlify/functions/lib/accountDelete.js'));

const EMAIL = 'delete-test@lexicoil.test';
const USER_ID = emailToUserId(EMAIL);

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

// Setup fake user data
const ms = mockStore();
store.set(userKey(EMAIL), JSON.stringify({ email: EMAIL, name: 'Test', plan: 'pro', stripeCustomerId: 'cus_test' }));
store.set(syncKey(EMAIL), JSON.stringify({ flashcards: [{ word: 'haus', lang: 'de' }], history: [{ score: 80 }] }));
store.set(`quota:${EMAIL}`, JSON.stringify({ month: '2026-07', personalLesenUsed: 5 }));
store.set(`speaking_session:${USER_ID}:abc123`, JSON.stringify({ turns: [] }));
store.set(`speaking_live:${USER_ID}:def456`, JSON.stringify({ turns: [] }));
store.set(`exam_timer:${USER_ID}:exam1`, JSON.stringify({ startedAt: Date.now() }));

ok(verifyDeleteConfirmation('DELETE'), 'confirm phrase DELETE accepted');
ok(verifyDeleteConfirmation('delete'), 'confirm phrase case-insensitive');
ok(!verifyDeleteConfirmation('ELIMINAR'), 'wrong phrase rejected');

const blobResult = await deleteUserBlobs(ms, EMAIL, USER_ID);
ok(blobResult.direct >= 3, `direct keys deleted (${blobResult.direct})`);
ok(blobResult.speaking >= 2, `speaking sessions deleted (${blobResult.speaking})`);
ok(blobResult.examTimer >= 1, `exam timers deleted (${blobResult.examTimer})`);
ok(!store.has(userKey(EMAIL)), 'user blob gone');
ok(!store.has(syncKey(EMAIL)), 'sync blob gone');
ok(!store.has(`quota:${EMAIL}`), 'quota blob gone');
ok(!store.has(`speaking_session:${USER_ID}:abc123`), 'speaking chat gone');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
