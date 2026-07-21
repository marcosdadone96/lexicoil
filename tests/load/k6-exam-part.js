/**
 * k6 — exam-part only (generic + personal vocab paths).
 * Run: k6 run tests/load/k6-exam-part.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const latency = new Trend('exam_part_duration', true);
const BASE = __ENV.LOAD_TEST_BASE_URL || 'https://staging.lexicoil.com';
const JWT = __ENV.LOAD_TEST_JWT || '';

export const options = {
  stages: [
    { duration: '2m', target: Number(__ENV.LOAD_VUS || 100) },
    { duration: '5m', target: Number(__ENV.LOAD_VUS || 100) },
    { duration: '2m', target: Number(__ENV.LOAD_VUS_PEAK || 500) },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    exam_part_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function () {
  const generic = `${BASE}/.netlify/functions/exam-part?lang=de&level=B1&module=lesen&teil=1`;
  const r1 = http.get(generic);
  latency.add(r1.timings.duration);
  check(r1, { 'generic 200': (r) => r.status === 200 });

  if (JWT) {
    const rid = `load-${__VU}-${__ITER}`;
    const personal = `${BASE}/.netlify/functions/exam-part?lang=de&level=B1&module=lesen&teil=1&words=fitness,therapie&poolRequestId=${rid}`;
    const r2 = http.get(personal, { headers: { Authorization: `Bearer ${JWT}` } });
    latency.add(r2.timings.duration);
    check(r2, { 'personal 200/429': (r) => r.status === 200 || r.status === 429 });
  }

  sleep(0.3 + Math.random());
}
