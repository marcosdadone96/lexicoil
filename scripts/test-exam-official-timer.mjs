#!/usr/bin/env node
/**
 * Official exam server timer — manipulation resistance test.
 * Run: node scripts/test-exam-official-timer.mjs
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
  };
}

const { startOfficialTimer, finishOfficialTimer } = require(path.join(
  ROOT,
  'netlify/functions/lib/examOfficialTimer.js',
));

const USER_ID = 'user-timer-test';
const EMAIL = 'timer@test.com';
const EXAM_ID = 'exam-save-123';
const ms = mockStore();

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

const start = await startOfficialTimer(ms, {
  userId: USER_ID,
  email: EMAIL,
  examSavedId: EXAM_ID,
  limitMinutes: 90,
});
ok(start.ok && start.timerSessionId, 'timer started');
ok(!start.resumed, 'fresh start not resumed');

// Simulate client manipulating timerEndsAt — server still uses startedAt
const key = `exam_timer:${USER_ID}:${EXAM_ID}`;
const session = JSON.parse(store.get(key));
session.startedAt = Date.now() - 95 * 60 * 1000; // 95 min ago (> 90 + grace)
store.set(key, JSON.stringify(session));

const finish = await finishOfficialTimer(ms, {
  userId: USER_ID,
  timerSessionId: start.timerSessionId,
  examSavedId: EXAM_ID,
});
ok(finish.validated, 'finish validated');
ok(finish.serverTimeExceeded === true, 'server marks time exceeded despite client timer hack');
ok(finish.serverElapsedSec >= 90 * 60, `elapsed ${finish.serverElapsedSec}s`);

// Within limit case
store.clear();
const start2 = await startOfficialTimer(ms, {
  userId: USER_ID,
  email: EMAIL,
  examSavedId: 'exam-short',
  limitMinutes: 90,
});
const finish2 = await finishOfficialTimer(ms, {
  userId: USER_ID,
  timerSessionId: start2.timerSessionId,
  examSavedId: 'exam-short',
});
ok(finish2.serverTimeExceeded === false, 'on-time exam not flagged');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
