/**
 * k6 — vocab-bg-trigger (internal endpoint).
 * Run: k6 run tests/load/k6-vocab-bg-trigger.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.LOAD_TEST_BASE_URL || 'https://staging.lexicoil.com';
const SECRET = __ENV.VOCAB_BG_INTERNAL_SECRET || __ENV.AUTH_JWT_SECRET || '';
const EMAIL = __ENV.LOAD_TEST_EMAIL || 'loadtest@example.com';

export const options = {
  vus: Number(__ENV.LOAD_VUS || 20),
  duration: '2m',
};

export default function () {
  if (!SECRET) {
    sleep(1);
    return;
  }
  const res = http.post(
    `${BASE}/.netlify/functions/vocab-bg-trigger`,
    JSON.stringify({ email: EMAIL }),
    {
      headers: {
        'Content-Type': 'application/json',
        'x-vocab-bg-secret': SECRET,
      },
    },
  );
  check(res, { 'trigger 200/202': (r) => r.status === 200 || r.status === 202 });
  sleep(1);
}
