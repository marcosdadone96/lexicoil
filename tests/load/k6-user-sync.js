/**
 * k6 — user-sync GET/PUT.
 * Run: k6 run tests/load/k6-user-sync.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.LOAD_TEST_BASE_URL || 'https://staging.lexicoil.com';
const JWT = __ENV.LOAD_TEST_JWT || '';

export const options = {
  vus: Number(__ENV.LOAD_VUS || 50),
  duration: '5m',
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.03'],
  },
};

const minimalPut = {
  data: {
    flashcards: [{ word: 'Test', translation: 'Prüfung', sourceLang: 'de', sourceLevel: 'B1' }],
    updatedAt: Date.now(),
  },
};

export default function () {
  if (!JWT) {
    console.warn('LOAD_TEST_JWT required');
    sleep(1);
    return;
  }
  const headers = {
    Authorization: `Bearer ${JWT}`,
    'Content-Type': 'application/json',
  };
  const getRes = http.get(`${BASE}/.netlify/functions/user-sync`, { headers });
  check(getRes, { 'GET 200': (r) => r.status === 200 });

  if (__ITER % 5 === 0) {
    const putRes = http.put(`${BASE}/.netlify/functions/user-sync`, JSON.stringify(minimalPut), { headers });
    check(putRes, { 'PUT 200': (r) => r.status === 200 });
  }
  sleep(1 + Math.random() * 2);
}
