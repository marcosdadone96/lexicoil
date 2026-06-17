#!/usr/bin/env node
/**
 * HTTP smoke test — German B1 happy paths (pool, tickets, quota, pool admin, Stripe).
 *
 * Targets staging / deploy previews only by default (mutating steps).
 * Exit code 1 on failure.
 *
 * Usage:
 *   SMOKE_BASE_URL=https://preview--lexicoil.netlify.app node scripts/smoke-b1-de.mjs
 *   node scripts/smoke-b1-de.mjs --skip-anthropic --skip-webhook
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const { GUEST_MAX } = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js'));
const { validateGeneratedExam } = require(path.join(ROOT, 'netlify/functions/lib/examQualityGate.js'));

// ── Env bootstrap ───────────────────────────────────────────────────────────
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

const ARGS = new Set(process.argv.slice(2));
const SKIP_ANTHROPIC = ARGS.has('--skip-anthropic');
const SKIP_WEBHOOK = ARGS.has('--skip-webhook');
const SKIP_POOL = ARGS.has('--skip-pool-mutate');
const BASE_URL = (
  ARGS.find((a) => a.startsWith('--base-url='))?.split('=').slice(1).join('=') ||
  process.env.SMOKE_BASE_URL ||
  process.env.LEXICOIL_SITE_URL ||
  ''
).replace(/\/$/, '');

const LANG = 'de';
const LEVEL = 'B1';
const RUN_ID = randomUUID().slice(0, 8);

let passed = 0;
let failed = 0;

function log(msg) {
  console.log(`[smoke:${RUN_ID}] ${msg}`);
}

function fail(msg, detail) {
  failed += 1;
  console.error(`[smoke:${RUN_ID}] FAIL ${msg}`);
  if (detail !== undefined) console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
}

function ok(msg) {
  passed += 1;
  log(`OK   ${msg}`);
}

function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else fail(msg, detail);
}

function assertProductionSafe() {
  if (!BASE_URL) {
    fail('SMOKE_BASE_URL or --base-url= is required');
    process.exit(1);
  }
  let host;
  try {
    host = new URL(BASE_URL).hostname.toLowerCase();
  } catch {
    fail('Invalid BASE_URL', BASE_URL);
    process.exit(1);
  }
  const prod = host === 'lexicoil.com' || host === 'www.lexicoil.com';
  if (prod && process.env.SMOKE_ALLOW_PRODUCTION !== '1') {
    console.error(
      '[smoke] Refusing mutating smoke against production. Use a staging/preview URL or set SMOKE_ALLOW_PRODUCTION=1.',
    );
    process.exit(1);
  }
}

function originHeader() {
  try {
    return new URL(BASE_URL).origin;
  } catch {
    return BASE_URL;
  }
}

async function api(fnPath, { method = 'GET', body, token, guestIp, headers = {} } = {}) {
  const url = `${BASE_URL}/.netlify/functions/${fnPath}`;
  const h = {
    Accept: 'application/json',
    Origin: originHeader(),
    ...headers,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  if (guestIp) h['X-Forwarded-For'] = guestIp;
  if (body !== undefined) h['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  return { status: res.status, data, ok: res.ok };
}

function signStripeEvent(payload, secret) {
  const ts = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify(payload);
  const sig = createHmac('sha256', secret).update(`${ts}.${rawBody}`, 'utf8').digest('hex');
  return { rawBody, header: `t=${ts},v1=${sig}` };
}

async function postStripeWebhook(eventPayload) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET required for webhook smoke');
  const { rawBody, header } = signStripeEvent(eventPayload, secret);
  const url = `${BASE_URL}/.netlify/functions/stripe-webhook`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': header,
    },
    body: rawBody,
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

function scorableItems(part) {
  if (!part || typeof part !== 'object') return [];
  if (Array.isArray(part.items) && part.items.length) return part.items;
  if (Array.isArray(part.questions) && part.questions.length) return part.questions;
  if (Array.isArray(part.segments) && part.segments.length) return part.segments;
  return [];
}

function assertExamStructure(exam, label) {
  assert(exam && typeof exam === 'object', `${label}: exam object`);
  const lang = String(exam.lang || '').toLowerCase();
  assert(lang === 'de' || lang === 'german' || exam.goetheFormat, `${label}: german exam`);
  const parts = [...(exam.lesenParts || []), ...(exam.horenParts || [])];
  assert(parts.length > 0, `${label}: has lesen/horen parts`);
  let itemCount = 0;
  for (const part of parts) {
    const items = scorableItems(part);
    assert(items.length > 0, `${label}: part has scorable items`);
    for (const it of items) {
      const hasContent = !!(it.question || it.text || it.statement || it.prompt);
      assert(hasContent || it.id, `${label}: item not empty`);
      itemCount += 1;
    }
    const passage = part.text || part.transcript || part.passage;
    if (passage) assert(String(passage).trim().length > 10, `${label}: passage/transcript present`);
  }
  assert(itemCount > 0, `${label}: total scorable items > 0`);
}

const SMOKE_EXAM = {
  goetheFormat: true,
  lang: 'de',
  level: 'B1',
  lesenParts: [
    {
      teil: 1,
      text:
        'In der Stadt gibt es neue Regeln für Recycling und Mülltrennung. ' +
        'Viele Familien lernen, wie Plastik, Papier und Bioabfall getrennt werden. ' +
        'Die Gemeinde erklärt die Vorteile für Umwelt und Klima.',
      items: [
        {
          id: 'smoke_l1',
          question: 'Was ist das Thema des Textes?',
          options: ['a) Sport', 'b) Recycling', 'c) Reisen'],
          correct: 'b',
        },
      ],
    },
  ],
  horenParts: [
    {
      transcript:
        'Moderator: Guten Tag, willkommen im Radio. Gast: Danke, ich freue mich über die Einladung zum Interview.',
      segments: [
        {
          id: 'smoke_h1',
          question: 'Wer spricht im Dialog?',
          options: ['A) Nur der Gast', 'B) Moderator und Gast', 'C) Niemand'],
          correct: 'B',
        },
      ],
    },
  ],
};

const fixtureGate = validateGeneratedExam(SMOKE_EXAM);
if (!fixtureGate.valid) {
  console.error('[smoke] SMOKE_EXAM fixture failed validation:', fixtureGate.errors);
  process.exit(1);
}

async function login(email, password) {
  const res = await api('auth-login', { method: 'POST', body: { email, password } });
  if (res.status !== 200 || !res.data?.token) {
    throw new Error(`login failed (${res.status}): ${res.data?.error || 'no token'}`);
  }
  return res.data.token;
}

async function ensureUser(email, password, name) {
  try {
    return await login(email, password);
  } catch {
    const res = await api('auth-register', { method: 'POST', body: { email, password, name } });
    if (res.status === 409) return login(email, password);
    assert(res.status === 200 && res.data?.token, 'register smoke user', res.data);
    return res.data.token;
  }
}

async function authMe(token) {
  const res = await api('auth-me', { token });
  assert(res.status === 200, 'auth-me', res.data);
  return res.data?.user;
}

// ── 1. Pool + library (read-only) ───────────────────────────────────────────
async function stepPoolAndLibrary() {
  log('Step 1 — pool GET + library bank');

  const bankRes = await fetch(`${BASE_URL}/library/${LANG}/${LEVEL}/questions.json`, {
    headers: { Accept: 'application/json' },
  });
  assert(bankRes.status === 200, 'library questions.json 200');
  const bank = await bankRes.json();
  assert(Array.isArray(bank.questions) && bank.questions.length > 0, 'library has questions');
  const sample = bank.questions.find((q) => q.id && (q.question || q.text || q.statement));
  assert(!!sample, 'library question has content');

  const pool = await api(`exam-pool?lang=${LANG}&level=${LEVEL}`);
  assert(pool.status === 200, 'exam-pool GET 200', pool.data);
  if (pool.data?.found) {
    assertExamStructure(pool.data.exam, 'pool exam');
    assert(pool.data.id, 'pool exam id present');
    ok(`pool served exam id=${pool.data.id}`);
  } else {
    ok('pool empty — library bank validated (acceptable on fresh staging)');
  }
}

// ── 2. Generation ticket gate ───────────────────────────────────────────────
async function stepTicketGate() {
  log('Step 2 — gen ticket (startGeneration + ticket_required)');

  const guestIp = process.env.SMOKE_GUEST_IP || `203.0.113.${Math.floor(Math.random() * 200) + 1}`;

  const noTicket = await api('claude-chat', {
    method: 'POST',
    guestIp,
    body: {
      examGeneration: true,
      aiAction: 'exam_generation',
      prompt: 'Return minimal JSON lesenParts only.',
      maxTokens: 64,
      lang: LANG,
      level: LEVEL,
    },
  });
  assert(noTicket.status === 403, 'examGeneration without ticket → 403', noTicket.data);
  assert(noTicket.data?.error === 'ticket_required', 'error ticket_required', noTicket.data);

  const start = await api('claude-chat', {
    method: 'POST',
    guestIp,
    body: { startGeneration: true, scope: 'exam_generation', maxChunks: 2 },
  });
  assert(start.status === 200, 'startGeneration 200', start.data);
  assert(typeof start.data?.ticket === 'string' && start.data.ticket.length > 20, 'genTicket issued');
  assert(start.data?.plan === 'guest', 'guest plan on ticket issue', start.data);

  if (SKIP_ANTHROPIC) {
    ok('chunk with ticket skipped (--skip-anthropic)');
    return;
  }

  const chunk = await api('claude-chat', {
    method: 'POST',
    guestIp,
    body: {
      examGeneration: true,
      aiAction: 'exam_generation',
      genTicket: start.data.ticket,
      prompt:
        'Reply with ONLY valid JSON: {"lesenParts":[{"teil":1,"text":"Kurzer Text.","items":[{"id":"1","question":"Ja?","options":["a) Ja","b) Nein"],"correct":"a"}]}]}',
      maxTokens: 256,
      lang: LANG,
      level: LEVEL,
    },
  });
  assert(chunk.status === 200, 'examGeneration with ticket → 200', chunk.data);
  assert(chunk.data?.text || chunk.data?.content, 'chunk response has text', chunk.data);
}

// ── 3. Guest quota exhaustion ─────────────────────────────────────────────────
async function stepGuestQuota() {
  log(`Step 3 — guest quota (GUEST_MAX=${GUEST_MAX})`);

  const guestIp = process.env.SMOKE_QUOTA_IP || `203.0.114.${Math.floor(Math.random() * 200) + 1}`;

  for (let i = 0; i < GUEST_MAX; i += 1) {
    const res = await api('claude-chat', {
      method: 'POST',
      guestIp,
      body: { startGeneration: true, scope: 'exam_generation', maxChunks: 1, requestId: `smoke-q-${RUN_ID}-${i}` },
    });
    assert(res.status === 200, `startGeneration ${i + 1}/${GUEST_MAX} succeeds`, res.data);
  }

  const over = await api('claude-chat', {
    method: 'POST',
    guestIp,
    body: { startGeneration: true, scope: 'exam_generation', maxChunks: 1, requestId: `smoke-q-${RUN_ID}-over` },
  });
  assert(over.status === 429, 'quota exhausted → 429 (not 500)', { status: over.status, data: over.data });
  assert(
    over.data?.error === 'quota_exceeded' || over.data?.error === 'quota_exhausted',
    'quota error code',
    over.data,
  );
  assert(over.data?.plan === 'guest', 'still guest plan when exhausted', over.data);
}

// ── 4. Pool moderation ──────────────────────────────────────────────────────
async function stepPoolModeration() {
  if (SKIP_POOL) {
    ok('pool moderation skipped (--skip-pool-mutate)');
    return;
  }

  log('Step 4 — pool publish / admin / disable / enable');

  const userEmail = process.env.SMOKE_USER_EMAIL;
  const userPassword = process.env.SMOKE_USER_PASSWORD;
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;

  if (!userEmail || !userPassword || !adminEmail || !adminPassword) {
    fail('pool moderation needs SMOKE_USER_* and SMOKE_ADMIN_* env vars');
    return;
  }

  const userToken = await ensureUser(userEmail, userPassword, 'Smoke User');
  const adminToken = await login(adminEmail, adminPassword);

  const topic = `SMOKE_${RUN_ID} B1 Lesen`;
  const pub = await api('exam-pool', {
    method: 'POST',
    token: userToken,
    body: { lang: LANG, level: LEVEL, topic, exam: SMOKE_EXAM, source: 'smoke' },
  });
  assert(pub.status === 200 && pub.data?.saved, 'publish to pool', pub.data);

  const poolId = String(pub.data?.key || '').split(':').pop();
  assert(poolId && poolId.length > 8, 'extract pool id from key', pub.data);

  const listed = await api(`admin-api?action=pool&lang=${LANG}&level=${LEVEL}`, { token: adminToken });
  assert(listed.status === 200, 'admin pool list', listed.data);
  const row = (listed.data?.exams || []).find((e) => e.id === poolId);
  assert(!!row, 'published exam in admin pool list', { poolId, count: listed.data?.count });

  const others = (listed.data?.exams || []).map((e) => e.id).filter((id) => id !== poolId);
  const exclude = others.slice(0, 40).join(',');
  const qs = `exam-pool?lang=${LANG}&level=${LEVEL}${exclude ? `&exclude=${encodeURIComponent(exclude)}` : ''}`;

  const served = await api(qs);
  assert(served.status === 200 && served.data?.found === true, 'pool serves smoke exam when isolated', served.data);
  assert(served.data?.id === poolId, 'served id matches published', served.data);

  const dis = await api('admin-api', {
    method: 'POST',
    token: adminToken,
    body: { action: 'disable_pool', lang: LANG, level: LEVEL, id: poolId },
  });
  assert(dis.status === 200 && dis.data?.ok, 'disable_pool', dis.data);

  const blocked = await api(qs);
  assert(blocked.status === 200, 'exam-pool GET after disable (200)', blocked.data);
  assert(blocked.data?.found !== true || blocked.data?.id !== poolId, 'disabled exam not served', blocked.data);

  const en = await api('admin-api', {
    method: 'POST',
    token: adminToken,
    body: { action: 'enable_pool', lang: LANG, level: LEVEL, id: poolId },
  });
  assert(en.status === 200 && en.data?.ok, 'enable_pool', en.data);

  const again = await api(qs);
  assert(again.status === 200 && again.data?.found === true && again.data?.id === poolId, 're-enabled exam served', again.data);

  await api('admin-api', {
    method: 'POST',
    token: adminToken,
    body: { action: 'delete_pool', lang: LANG, level: LEVEL, id: poolId },
  });
  ok('pool smoke exam deleted (teardown)');
}

// ── 5. Stripe webhooks ────────────────────────────────────────────────────────
async function stepStripeWebhooks() {
  if (SKIP_WEBHOOK) {
    ok('stripe webhooks skipped (--skip-webhook)');
    return;
  }

  log('Step 5 — Stripe webhooks (pro + credit_pack)');

  const email = process.env.SMOKE_WEBHOOK_EMAIL || process.env.SMOKE_USER_EMAIL;
  const password = process.env.SMOKE_WEBHOOK_PASSWORD || process.env.SMOKE_USER_PASSWORD;
  if (!email || !password) {
    fail('webhook smoke needs SMOKE_WEBHOOK_EMAIL/PASSWORD or SMOKE_USER_*');
    return;
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    fail('STRIPE_WEBHOOK_SECRET required for webhook smoke');
    return;
  }

  const token = await ensureUser(email, password, 'Smoke Webhook User');
  const before = await authMe(token);
  const creditsBefore = Number(before?.aiCredits?.creditTopups || 0);

  const proEventId = `evt_smoke_pro_${RUN_ID}`;
  const proRes = await postStripeWebhook({
    id: proEventId,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_smoke_${RUN_ID}`,
        customer: `cus_smoke_${RUN_ID}`,
        metadata: { email },
        client_reference_id: email,
      },
    },
  });
  assert(proRes.status === 200, 'checkout.session.completed (pro) → 200', proRes);

  await new Promise((r) => setTimeout(r, 500));
  const afterPro = await authMe(token);
  assert(afterPro?.plan === 'pro' || afterPro?.pro === true, 'user upgraded to pro', afterPro);

  const creditEventId = `evt_smoke_credits_${RUN_ID}`;
  const packCredits = 25;
  const creditRes = await postStripeWebhook({
    id: creditEventId,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_smoke_credits_${RUN_ID}`,
        customer: `cus_smoke_${RUN_ID}`,
        metadata: {
          kind: 'credit_pack',
          email,
          credits: String(packCredits),
        },
      },
    },
  });
  assert(creditRes.status === 200, 'checkout.session.completed (credit_pack) → 200', creditRes);

  await new Promise((r) => setTimeout(r, 500));
  const afterCredits = await authMe(token);
  const creditsAfter = Number(afterCredits?.aiCredits?.creditTopups || 0);
  assert(creditsAfter >= creditsBefore + packCredits, 'credit topups increased', {
    creditsBefore,
    creditsAfter,
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  assertProductionSafe();
  log(`Target: ${BASE_URL}`);
  log(`Flags: skip-anthropic=${SKIP_ANTHROPIC} skip-webhook=${SKIP_WEBHOOK} skip-pool=${SKIP_POOL}`);

  await stepPoolAndLibrary();
  await stepTicketGate();
  await stepGuestQuota();
  await stepPoolModeration();
  await stepStripeWebhooks();

  log(`Done — ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[smoke] Unhandled error:', err);
  process.exit(1);
});
