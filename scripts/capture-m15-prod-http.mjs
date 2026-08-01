#!/usr/bin/env node
/**
 * M15 production HTTP capture — raw bodies for planModule + fetch-by-id per pick.
 *
 *   SMOKE_ALLOW_PRODUCTION=1 SMOKE_USER_EMAIL=... SMOKE_USER_PASSWORD=... \
 *     node scripts/capture-m15-prod-http.mjs
 *
 * Optional admin probe (same pool, no user JWT):
 *   SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=... node scripts/capture-m15-prod-http.mjs --admin-probe
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { smokeLogin } from './lib/smokeAuthLogin.mjs';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const BASE = (process.env.SMOKE_BASE_URL || 'https://lexicoil.com').replace(/\/$/, '');
const M15 = ['Prüfung', 'Lernen', 'Urlaub', 'Bahn', 'Digital', 'Passwort', 'Stress'];
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/m15-prod-http-raw-' + new Date().toISOString().slice(0, 10) + '.json',
);

const adminProbe = process.argv.includes('--admin-probe');

function origin() {
  try {
    return new URL(BASE).origin;
  } catch {
    return BASE;
  }
}

async function rawGet(fnPath, token) {
  const url = `${BASE}/.netlify/functions/${fnPath}`;
  const headers = { Accept: 'application/json', Origin: origin() };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _parseError: true, _raw: text };
  }
  return {
    url,
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    rawBody: text,
    json,
  };
}

const report = {
  capturedAt: new Date().toISOString(),
  baseUrl: BASE,
  m15Surfaces: M15,
  steps: {},
};

// ── planModule (requires Pro JWT) ───────────────────────────────────────────
const params = new URLSearchParams({
  planModule: '1',
  lang: 'de',
  level: 'B1',
  module: 'horen',
  words: M15.join(','),
  assembleMode: 'practice',
  topicTag: 'Bildung',
});
const planPath = `exam-part?${params.toString()}`;

const email = process.env.SMOKE_USER_EMAIL;
const password = process.env.SMOKE_USER_PASSWORD;

if (email && password && process.env.SMOKE_ALLOW_PRODUCTION === '1') {
  const { token, via } = await smokeLogin(BASE, { email, password, origin: origin() });
  report.login = { via, emailDomain: email.split('@')[1] || '?' };

  report.steps.planModule = await rawGet(planPath, token);

  const picks = report.steps.planModule.json?.picks || [];
  report.steps.fetchById = [];
  for (const pick of picks) {
    if (!pick?.id) continue;
    const q = new URLSearchParams({
      lang: 'de',
      level: 'B1',
      module: 'horen',
      id: pick.id,
      assembleMode: 'practice',
    });
    report.steps.fetchById.push({
      pick,
      ...(await rawGet(`exam-part?${q}`, token)),
    });
  }
} else {
  report.steps.planModule = {
    skipped: true,
    reason: 'Set SMOKE_ALLOW_PRODUCTION=1, SMOKE_USER_EMAIL, SMOKE_USER_PASSWORD',
  };
  report.steps.planModuleUnauthenticated = await rawGet(planPath, null);
}

// Golden part by id (public GET, no auth) — always run
{
  const q = new URLSearchParams({
    lang: 'de',
    level: 'B1',
    module: 'horen',
    id: 'horen-t3-gemini-027',
    assembleMode: 'practice',
  });
  const hit = await rawGet(`exam-part?${q}`, null);
  report.steps.goldenByIdPublic = {
    id: 'horen-t3-gemini-027',
    partIsNull: hit.json?.part == null,
    status: hit.status,
    rawBodyLength: hit.rawBody.length,
    rawBody: hit.rawBody,
  };
}

if (adminProbe) {
  const ae = process.env.SMOKE_ADMIN_EMAIL;
  const ap = process.env.SMOKE_ADMIN_PASSWORD;
  if (ae && ap) {
    const { token } = await smokeLogin(BASE, { email: ae, password: ap, origin: origin() });
    const words = encodeURIComponent(M15.join(','));
    report.steps.adminPersonalPlanProbe = await rawGet(
      `admin-api?action=personal_plan_probe&lang=de&level=B1&module=horen&topicTag=Bildung&words=${words}`,
      token,
    );
  } else {
    report.steps.adminPersonalPlanProbe = { skipped: true, reason: 'SMOKE_ADMIN_* missing' };
  }
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log('Wrote', OUT);
if (report.steps.planModule?.json) {
  console.log(
    'planModule:',
    report.steps.planModule.status,
    'ok=',
    report.steps.planModule.json.ok,
    'decision=',
    report.steps.planModule.json.decision,
  );
}
if (report.steps.fetchById?.length) {
  for (const row of report.steps.fetchById) {
    console.log(
      '  byId',
      row.pick.id,
      'T',
      row.pick.teil,
      'status',
      row.status,
      'partNull=',
      row.json?.part == null,
    );
  }
}
