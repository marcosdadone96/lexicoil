/**
 * k6 mixed traffic — LexiCoil staging load test (design from scalability plan 2026-07-15).
 *
 * Run: k6 run tests/load/k6-mixed-traffic.js
 * Env: see tests/load/README.md
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const examPartLatency = new Trend('exam_part_duration', true);
const userSyncLatency = new Trend('user_sync_duration', true);
const errors = new Rate('errors');

const BASE = __ENV.LOAD_TEST_BASE_URL || 'https://staging.lexicoil.com';
const JWT = __ENV.LOAD_TEST_JWT || '';
const BG_SECRET = __ENV.VOCAB_BG_INTERNAL_SECRET || __ENV.AUTH_JWT_SECRET || '';

export const options = {
  scenarios: {
    exam_part_read: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Number(__ENV.LOAD_STAGE_1 || 50) },
        { duration: '3m', target: Number(__ENV.LOAD_STAGE_2 || 200) },
        { duration: '2m', target: Number(__ENV.LOAD_STAGE_3 || 500) },
        { duration: '1m', target: 0 },
      ],
      exec: 'examPartRead',
    },
    user_sync_read: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: Number(__ENV.LOAD_SYNC_VUS || 100) },
        { duration: '3m', target: Number(__ENV.LOAD_SYNC_VUS || 100) },
        { duration: '1m', target: 0 },
      ],
      exec: 'userSyncGet',
    },
    claude_chat_light: {
      executor: 'constant-vus',
      vus: Number(__ENV.LOAD_CLAUDE_VUS || 5),
      duration: '3m',
      exec: 'claudeChatDry',
    },
  },
  thresholds: {
    errors: ['rate<0.05'],
    exam_part_duration: ['p(95)<5000'],
    user_sync_duration: ['p(95)<3000'],
  },
};

export function examPartRead() {
  const url = `${BASE}/.netlify/functions/exam-part?lang=de&level=B1&module=lesen&teil=1`;
  const res = http.get(url, { tags: { endpoint: 'exam-part' } });
  examPartLatency.add(res.timings.duration);
  const ok = check(res, {
    'exam-part status 200': (r) => r.status === 200,
    'exam-part has body': (r) => r.body && r.body.length > 10,
  });
  if (!ok) errors.add(1);
  sleep(0.5 + Math.random() * 1.5);
}

export function userSyncGet() {
  if (!JWT) {
    sleep(1);
    return;
  }
  const url = `${BASE}/.netlify/functions/user-sync`;
  const res = http.get(url, {
    headers: { Authorization: `Bearer ${JWT}` },
    tags: { endpoint: 'user-sync' },
  });
  userSyncLatency.add(res.timings.duration);
  const ok = check(res, { 'user-sync status 200': (r) => r.status === 200 });
  if (!ok) errors.add(1);
  sleep(1 + Math.random() * 2);
}

/** Dry ping — set LOAD_CLAUDE_DRY=1 and use invalid genTicket to measure infra without Anthropic spend. */
export function claudeChatDry() {
  if (__ENV.LOAD_SKIP_CLAUDE === '1') {
    sleep(2);
    return;
  }
  const url = `${BASE}/.netlify/functions/claude-chat`;
  const res = http.post(
    url,
    JSON.stringify({ aiAction: 'spell_check', text: 'Hallo Welt' }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...(JWT ? { Authorization: `Bearer ${JWT}` } : {}),
      },
      tags: { endpoint: 'claude-chat' },
    },
  );
  const ok = check(res, { 'claude-chat responds': (r) => r.status === 200 || r.status === 401 || r.status === 429 });
  if (!ok) errors.add(1);
  sleep(3);
}

export function vocabBgTrigger() {
  if (!BG_SECRET) return;
  const url = `${BASE}/.netlify/functions/vocab-bg-trigger`;
  const res = http.post(
    url,
    JSON.stringify({ email: __ENV.LOAD_TEST_EMAIL || 'loadtest@example.com' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'x-vocab-bg-secret': BG_SECRET,
      },
      tags: { endpoint: 'vocab-bg-trigger' },
    },
  );
  check(res, { 'vocab-bg-trigger auth or ok': (r) => r.status === 200 || r.status === 401 });
  sleep(2);
}
