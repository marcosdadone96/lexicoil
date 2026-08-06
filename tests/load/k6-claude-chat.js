/**
 * k6 — claude-chat (light actions only by default).
 * Run: k6 run tests/load/k6-claude-chat.js
 *
 * IMPORTANT: set LOAD_SKIP_CLAUDE=1 for infra-only test (no Anthropic spend).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.LOAD_TEST_BASE_URL || 'https://staging.lexicoil.com';
const JWT = __ENV.LOAD_TEST_JWT || '';

export const options = {
  vus: Number(__ENV.LOAD_VUS || 10),
  duration: '3m',
};

export default function () {
  if (__ENV.LOAD_SKIP_CLAUDE === '1') {
    sleep(2);
    return;
  }
  if (!JWT) {
    sleep(1);
    return;
  }
  const res = http.post(
    `${BASE}/.netlify/functions/claude-chat`,
    JSON.stringify({ aiAction: 'spell_check', text: 'Das ist ein Test satz.' }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${JWT}`,
      },
    },
  );
  check(res, { 'responds': (r) => [200, 401, 429].includes(r.status) });
  sleep(5);
}
