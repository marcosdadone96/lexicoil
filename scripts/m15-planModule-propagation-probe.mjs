#!/usr/bin/env node
/**
 * Repeat authenticated M15 planModule requests; log cf-ray, age, body shape.
 * Usage: SMOKE_USER_EMAIL=... SMOKE_USER_PASSWORD=... node scripts/m15-planModule-propagation-probe.mjs [--runs=6] [--delay-ms=2500]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { smokeLogin } from './lib/smokeAuthLogin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

if (existsSync(path.join(ROOT, '.env'))) {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const BASE = (process.env.SMOKE_BASE_URL || 'https://lexicoil.com').replace(/\/$/, '');
const args = process.argv.slice(2);
const runs = Number(args.find((a) => a.startsWith('--runs='))?.split('=')[1]) || 6;
const delayMs = Number(args.find((a) => a.startsWith('--delay-ms='))?.split('=')[1]) || 2500;

const M15_QS =
  'planModule=1&lang=de&level=B1&module=horen&words=Pr%C3%BCfung%2CLernen%2CUrlaub%2CBahn%2CDigital%2CPasswort%2CStress&assembleMode=practice&topicTag=Bildung';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function bodyKind(data, status) {
  if (status === 401) return 'auth_401';
  if (status >= 500 && data?.error === 'internal_error') return 'internal_error';
  if (data?.ok === false && data?.reason === 'plan_internal_error') return 'plan_internal_error';
  if (data?.ok === true && data?.decision === 'serve_now') return 'plan_ok';
  if (data?.ok === true && data?.picks) return 'plan_ok_other_decision';
  if (data?.part === null && data?.ok == null) return 'legacy_part_null';
  if (data?.ok === false) return `plan_reject:${data.reason || 'unknown'}`;
  return `other:${JSON.stringify(Object.keys(data || {})).slice(0, 120)}`;
}

async function oneFetch(url, token, label) {
  const origin = new URL(BASE).origin;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Origin: origin,
      Authorization: `Bearer ${token}`,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    cache: 'no-store',
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _parseError: true, _raw: text.slice(0, 200) };
  }
  const h = (name) => res.headers.get(name);
  return {
    label,
    url,
    status: res.status,
    kind: bodyKind(data, res.status),
    cfRay: h('cf-ray'),
    age: h('age'),
    cacheControl: h('cache-control'),
    cacheStatus: h('cache-status'),
    netlifyVary: h('netlify-vary'),
    xNfRequestId: h('x-nf-request-id'),
    bodyPreview: text.slice(0, 280),
    ok: data?.ok,
    decision: data?.decision,
    hasPicks: Array.isArray(data?.picks) && data.picks.length > 0,
  };
}

async function main() {
  const email = process.env.SMOKE_USER_EMAIL;
  const password = process.env.SMOKE_USER_PASSWORD;
  if (!email || !password) {
    console.error('SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD required');
    process.exit(1);
  }

  const { token, via } = await smokeLogin(BASE, { email, password, origin: new URL(BASE).origin });
  console.log('login via', via);

  const url = `${BASE}/.netlify/functions/exam-part?${M15_QS}`;
  const results = [];

  for (let i = 1; i <= runs; i++) {
    const row = await oneFetch(url, token, `run_${i}`);
    results.push({ ...row, at: new Date().toISOString() });
    console.log(JSON.stringify(row));
    if (i < runs) await sleep(delayMs);
  }

  const kinds = [...new Set(results.map((r) => r.kind))];
  const outPath = path.join(ROOT, 'batches/ready/gate-logs/m15-planModule-propagation-probe-latest.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        base: BASE,
        runs,
        delayMs,
        distinctKinds: kinds,
        mixedBehavior: kinds.length > 1,
        results,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log('Wrote', outPath);
  console.log('distinctKinds', kinds, 'mixedBehavior', kinds.length > 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
