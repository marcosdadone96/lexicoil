#!/usr/bin/env node
/**
 * Post-deploy verification — personal vocab Phase 2 + A2 gap (production HTTP).
 *
 * Usage:
 *   SMOKE_ALLOW_PRODUCTION=1 node scripts/post-deploy-personal-vocab-prod.mjs
 *
 * Env: SMOKE_BASE_URL (default https://lexicoil.com), SMOKE_USER_* (Pro planModule),
 *      SMOKE_ADMIN_* (pool_gap_probe).
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { smokeLogin, diagnoseLoginMismatch } from './lib/smokeAuthLogin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

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

const BASE_URL = (process.env.SMOKE_BASE_URL || 'https://lexicoil.com').replace(/\/$/, '');
const RUN_ID = Date.now().toString(36);

function log(msg) {
  console.log(`[post-deploy:${RUN_ID}] ${msg}`);
}

function fail(msg, detail) {
  console.error(`[post-deploy:${RUN_ID}] FAIL ${msg}`);
  if (detail !== undefined) {
    console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
  }
  process.exit(1);
}

function ok(msg) {
  log(`OK   ${msg}`);
}

function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else fail(msg, detail);
}

function originHeader() {
  try {
    return new URL(BASE_URL).origin;
  } catch {
    return BASE_URL;
  }
}

async function api(fnPath, { method = 'GET', body, token, headers = {} } = {}) {
  const url = `${BASE_URL}/.netlify/functions/${fnPath}`;
  const h = {
    Accept: 'application/json',
    Origin: originHeader(),
    ...headers,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  const init = { method, headers: h };
  if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  let data;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text.slice(0, 500) };
  }
  return { status: res.status, data, rawBody: text, url, headers: Object.fromEntries(res.headers.entries()) };
}

async function login(email, password) {
  try {
    const { token, via } = await smokeLogin(BASE_URL, {
      email,
      password,
      origin: originHeader(),
    });
    ok(`login via ${via}`);
    return token;
  } catch (err) {
    const diag = await diagnoseLoginMismatch(BASE_URL, email);
    fail('auth login', {
      message: err.message,
      diagnosis: diag,
    });
  }
}

async function fetchStatic(relativePath) {
  const url = `${BASE_URL}/${relativePath.replace(/^\//, '')}`;
  const res = await fetch(url, { headers: { Accept: '*/*' } });
  const text = await res.text();
  return { status: res.status, text, url };
}

async function stepStaticAssets() {
  log('Step 1 — static assets on production');
  const eg = await fetchStatic('js/ui/exam/examGeneration.js');
  assert(eg.status === 200, `examGeneration.js HTTP ${eg.status}`, eg.url);
  assert(
    eg.text.includes('_personalTextDecision'),
    'examGeneration contains Phase2 _personalTextDecision',
  );
  assert(
    eg.text.includes('_personalCoveragePartial'),
    'examGeneration contains serve_partial flag _personalCoveragePartial',
  );

  const a2 = await fetchStatic('js/data/a2Topics.js');
  assert(a2.status === 200, `a2Topics.js HTTP ${a2.status}`, a2.url);
  assert(a2.text.includes('A2_OFFICIAL_TOPICS'), 'a2Topics.js deployed');
  assert(a2.text.includes("'Umwelt'"), 'a2Topics includes Umwelt slug');
  ok(`static URLs: ${eg.url} (${eg.text.length} bytes)`);
}

/** Same query shape as fetchExamModulePlan (claudeClient.js) — words joined, URLSearchParams encodes once. */
function planModuleUrl(module, lang, level, words, topic) {
  const params = new URLSearchParams({
    planModule: '1',
    lang,
    level,
    module,
    words: words.slice(0, 40).join(','),
    assembleMode: 'practice',
  });
  if (topic) params.set('topicTag', String(topic));
  const qs = params.toString();
  const decodedSurfaces = params.get('words').split(',').map((s) => s.trim()).filter(Boolean);
  return { path: `exam-part?${qs}`, qs, decodedSurfaces };
}

async function stepPlanModule(token, { m15Only = false, dumpRaw = false } = {}) {
  log('Step 2 — exam-part planModule (production functions + pool index)');

  // Golden sim: scripts/test-personal-module-text-verified.mjs (surfaces, not lemmas)
  const M15_WORDS = ['Prüfung', 'Lernen', 'Urlaub', 'Bahn', 'Digital', 'Passwort', 'Stress'];
  const M01_PARTIAL_WORDS = ['Recycling', 'Klimawandel', 'Beruf', 'Gehalt', 'Smartphone', 'Arzt'];

  const m15Req = planModuleUrl('horen', 'de', 'B1', M15_WORDS, 'Bildung');
  console.log('INFO M15 words sent (surfaces):', JSON.stringify(m15Req.decodedSurfaces));
  console.log('INFO M15 query words param:', m15Req.qs.match(/words=([^&]+)/)?.[1] || '(none)');

  const now = await api(m15Req.path, { token });
  if (dumpRaw) {
    const dumpPath = path.join(ROOT, 'batches/ready/gate-logs/m15-post-deploy-planModule-raw-latest.json');
    writeFileSync(
      dumpPath,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          requestUrl: `${BASE_URL}/.netlify/functions/${m15Req.path}`,
          decodedSurfaces: m15Req.decodedSurfaces,
          response: {
            status: now.status,
            headers: now.headers,
            rawBody: now.rawBody,
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    log(`Wrote planModule raw HTTP → batches/ready/gate-logs/m15-post-deploy-planModule-raw-latest.json`);
    const picks = now.data?.picks || [];
    if (picks.length) {
      const byId = [];
      for (const pick of picks) {
        if (!pick?.id) continue;
        const q = new URLSearchParams({
          lang: 'de',
          level: 'B1',
          module: 'horen',
          id: pick.id,
          assembleMode: 'practice',
        });
        const row = await api(`exam-part?${q}`, { token });
        byId.push({
          pick,
          status: row.status,
          rawBody: row.rawBody,
          partIsNull: row.data?.part == null,
        });
      }
      const byIdPath = path.join(ROOT, 'batches/ready/gate-logs/m15-post-deploy-fetchById-raw-latest.json');
      writeFileSync(byIdPath, JSON.stringify({ capturedAt: new Date().toISOString(), byId }, null, 2), 'utf8');
      log(`Wrote fetch-by-id raw HTTP → batches/ready/gate-logs/m15-post-deploy-fetchById-raw-latest.json`);
    }
  }
  if (now.data?.words) {
    console.log(
      'INFO M15 plan response.words (server lemmas for index — not the HTTP surfaces):',
      JSON.stringify(now.data.words),
    );
  }
  assert(now.status === 200, 'B1 M15 plan HTTP 200', { status: now.status, data: now.data });
  assert(now.data?.ok === true, 'B1 M15 plan ok', now.data);
  assert(now.data?.textVerified === true, 'B1 M15 textVerified', now.data);
  assert(now.data?.decision === 'serve_now', 'B1 M15 serve_now', {
    decision: now.data?.decision,
    textCoveredCount: now.data?.textCoveredCount,
  });
  console.log('INFO B1 serve_now:', JSON.stringify({
    decision: now.data.decision,
    textCoveredCount: now.data.textCoveredCount,
    textCoveredWords: now.data.textCoveredWords,
    module: 'horen',
    level: 'B1',
  }, null, 2));

  if (m15Only) {
    ok('M15-only run complete');
    return;
  }

  const m01Req = planModuleUrl('lesen', 'de', 'B1', M01_PARTIAL_WORDS, 'Umwelt');
  console.log('INFO M01 words sent (surfaces):', JSON.stringify(m01Req.decodedSurfaces));
  const partial = await api(m01Req.path, { token });
  assert(partial.status === 200, 'B1 M01 partial plan HTTP 200', partial);
  assert(partial.data?.textVerified === true, 'B1 M01 textVerified', partial.data);
  assert(
    partial.data?.decision === 'serve_partial',
    'B1 M01 serve_partial (sim golden M01 lesen/Umwelt)',
    {
      decision: partial.data?.decision,
      textCoveredCount: partial.data?.textCoveredCount,
      ok: partial.data?.ok,
    },
  );
  console.log('INFO B1 serve_partial:', JSON.stringify({
    decision: partial.data.decision,
    textCoveredCount: partial.data.textCoveredCount,
    textCoveredWords: partial.data.textCoveredWords,
    module: 'lesen',
    level: 'B1',
  }, null, 2));
}

async function stepA2GapProbe(adminToken) {
  log('Step 3 — A2 gap (admin pool_gap_probe on production seed)');
  const res = await api(
    'admin-api?action=pool_gap_probe&lang=de&level=A2&module=horen&teil=2',
    { token: adminToken },
  );
  assert(res.status === 200 && res.data?.ok, 'pool_gap_probe HTTP', res);
  assert(res.data.gapTopicCount === 5, 'A2 gapTopicCount === 5', res.data);
  const official = ['Reisen', 'Gesundheit', 'Stadtleben', 'Medien', 'Umwelt'];
  assert(
    official.every((t) => (res.data.gapTopics || []).includes(t)),
    'gapTopics are official 5',
    res.data.gapTopics,
  );
  assert(
    official.includes(res.data.pickScarcestTopic),
    'pickScarcestTopic ∈ official 5',
    res.data.pickScarcestTopic,
  );
  assert(
    (res.data.ranked || []).every((r) => official.includes(r.topic)),
    'ranked topics ⊆ official 5',
    res.data.ranked,
  );
  console.log('INFO A2 gap probe:', JSON.stringify(res.data, null, 2));
}

async function stepPartialUiNote() {
  log('Step 4 — serve_partial banner (manual UI note)');
  console.log(
    'NOTE: Orange partial copy uses formatPersonalPartialWarning in examRunner after pool assemble.',
  );
  console.log(
    'NOTE: No automated browser capture in this script; API serve_partial above proves server+client gate inputs.',
  );
  ok('partial UI requires operator spot-check: generate B1 personal lesen/Umwelt with M01 words');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const m15Only = args.has('--m15-only');
  const dumpRaw = args.has('--dump-raw') || m15Only;

  const host = new URL(BASE_URL).hostname.toLowerCase();
  const prod = host === 'lexicoil.com' || host === 'www.lexicoil.com';
  if (prod && process.env.SMOKE_ALLOW_PRODUCTION !== '1') {
    fail('Set SMOKE_ALLOW_PRODUCTION=1 to run against production', BASE_URL);
  }

  log(`BASE_URL=${BASE_URL}`);
  if (m15Only) log('Mode: --m15-only (skip partial + gap)');
  await stepStaticAssets();

  const email = process.env.SMOKE_USER_EMAIL;
  const password = process.env.SMOKE_USER_PASSWORD;
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;

  if (!email || !password) {
    fail('SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD required for planModule steps');
  }
  if (!m15Only && (!adminEmail || !adminPassword)) {
    fail('SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD required for A2 gap probe');
  }

  const userToken = await login(email, password);
  ok('Pro/user login');
  await stepPlanModule(userToken, { m15Only, dumpRaw });

  if (m15Only) {
    log('Done (--m15-only).');
    return;
  }

  const adminToken = await login(adminEmail, adminPassword);
  ok('admin login');
  await stepA2GapProbe(adminToken);

  await stepPartialUiNote();
  log('All post-deploy checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
