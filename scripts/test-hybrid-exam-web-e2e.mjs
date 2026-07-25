#!/usr/bin/env node
/**
 * Web hybrid E2E — exam-plan + hybridExamWebExecute (NO terminal spawn, NO UI).
 *
 *   ALLOW_LIVE_GEN=1 node scripts/test-hybrid-exam-web-e2e.mjs
 *   ALLOW_LIVE_GEN=1 node scripts/test-hybrid-exam-web-e2e.mjs --skip-live  # plan + pool only
 *
 * Requires: AUTH_JWT_SECRET, GEMINI_API_KEY (unless --skip-live)
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.AUTH_JWT_SECRET =
  process.env.AUTH_JWT_SECRET || process.env.LEXICOIL_JWT_SECRET || 'test-secret-at-least-16-chars!!';

const SKIP_LIVE = process.argv.includes('--skip-live') || process.argv.includes('--skip-anthropic');
const ALLOW_LIVE = process.env.ALLOW_LIVE_GEN === '1' || process.env.ALLOW_LIVE_GEN === 'true';

const WORDS = [
  'Klimawandel',
  'Mülltrennung',
  'Recycling',
  'Plastik',
  'Energie',
  'Umwelt',
  'Nachhaltigkeit',
  'Naturschutz',
  'erneuerbar',
  'Klima',
];

const EXPECT_POOL_IDS = {
  1: 'bank-de-B1-lesen-t1-04ee6b44891a351f',
  2: 'bank-de-B1-lesen-t2-83e9ba03b205652b',
};

class MemoryBlobStore {
  constructor() {
    this.blobs = new Map();
    this.etagSeq = 0;
  }

  async getWithMetadata(key) {
    const row = this.blobs.get(key);
    if (!row) return null;
    return { data: structuredClone(row.data), etag: row.etag };
  }

  async get(key, opts = {}) {
    const row = await this.getWithMetadata(key);
    const data = row?.data ?? null;
    if (opts.type === 'json' && typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
    return data;
  }

  async setJSON(key, data, opts = {}) {
    const existing = this.blobs.get(key);
    if (opts.onlyIfNew && existing) return { modified: false };
    if (opts.onlyIfMatch && (!existing || existing.etag !== opts.onlyIfMatch)) {
      return { modified: false };
    }
    this.etagSeq += 1;
    this.blobs.set(key, { data: structuredClone(data), etag: `e${this.etagSeq}` });
    return { modified: true };
  }

  async delete(key) {
    this.blobs.delete(key);
  }

  async list({ prefix }) {
    const keys = [...this.blobs.keys()].filter((k) => k.startsWith(prefix));
    return { blobs: keys.map((key) => ({ key })) };
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`  ❌ ${msg}`);
    process.exit(1);
  }
  console.log(`  ✅ ${msg}`);
}

function makeEvent(authToken) {
  return {
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
    },
  };
}

function handlerBody(res) {
  return typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
}

const store = new MemoryBlobStore();
const blobStorePath = path.join(ROOT, 'netlify/functions/lib/blobStore.js');
require(blobStorePath).getStoreForEvent = () => store;

const { signAuthToken, userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const quotaLibPath = path.join(ROOT, 'netlify/functions/lib/quotaLib.js');
delete require.cache[quotaLibPath];
const quotaLib = require(quotaLibPath);

const email = 'hybrid-web@test.com';
await store.setJSON(userKey(email), {
  email,
  name: 'Hybrid Web Test',
  plan: 'pro',
  tokenVersion: 1,
});
await store.setJSON(`quota:${email}`, {
  used: 0,
  aiUsed: 0,
  aiMax: 100,
  month: quotaLib.getMonthKey(),
  version: 1,
});

const { token: authToken } = signAuthToken(email, 'Hybrid Web Test', 1);
const event = makeEvent(authToken);

console.log('\n══════════════════════════════════════════════════════════');
console.log(' WEB HYBRID E2E — exam-plan + hybridExamWebExecute');
console.log(` ALLOW_LIVE_GEN=${process.env.ALLOW_LIVE_GEN || '(unset)'}`);
console.log(` Live factory: ${SKIP_LIVE ? 'SKIPPED (--skip-live)' : ALLOW_LIVE ? 'YES (Gemini)' : 'NO (set ALLOW_LIVE_GEN=1)'}`);
console.log('══════════════════════════════════════════════════════════\n');

if (!SKIP_LIVE && !ALLOW_LIVE) {
  console.error('  ❌ Live web path requires ALLOW_LIVE_GEN=1 (or --skip-anthropic for plan-only)');
  process.exit(1);
}
if (!SKIP_LIVE && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
  console.error('  ❌ Live web path requires GEMINI_API_KEY');
  process.exit(1);
}

// ── 1. exam-plan endpoint ──
console.log('── exam-plan ──');
const examPlanHandler = require(path.join(ROOT, 'netlify/functions/exam-plan.js')).handler;
const planRes = await examPlanHandler({
  httpMethod: 'POST',
  headers: event.headers,
  body: JSON.stringify({
    module: 'lesen',
    teils: [1, 2, 3, 4, 5],
    topic: 'Umwelt',
    vocab: WORDS,
    lang: 'de',
    level: 'B1',
  }),
});
assert(planRes.statusCode === 200, 'exam-plan HTTP 200');
const planBody = handlerBody(planRes);
const plan = planBody.plan;
assert(plan?.fromPool?.length === 2, 'plan.fromPool = 2 (T1,T2)');
assert(plan?.toGenerate?.length === 3, 'plan.toGenerate = 3 (T3,T4,T5)');
assert(
  plan.fromPool.some((p) => p.partId === EXPECT_POOL_IDS[1]),
  `pool T1 id ${EXPECT_POOL_IDS[1]}`,
);
assert(
  plan.fromPool.some((p) => p.partId === EXPECT_POOL_IDS[2]),
  `pool T2 id ${EXPECT_POOL_IDS[2]}`,
);
console.log(`  fromPool: [${plan.fromPool.map((p) => `T${p.teil}:${p.partId.slice(0, 20)}…`).join(', ')}]`);
console.log(`  toGenerate teils: [${plan.toGenerate.map((c) => c.teil).join(', ')}]`);
console.log(`  vocab pending (${plan.vocabCoverage.pending.length}): [${plan.vocabCoverage.pending.slice(0, 4).join(', ')}…]`);

// ── 2. Web execution ──
console.log('\n── hybridExamWebExecute ──');
delete require.cache[path.join(ROOT, 'netlify/functions/claude-chat.js')];
const claudeHandler = require(path.join(ROOT, 'netlify/functions/claude-chat.js')).handler;
const { executeHybridLesenExamWeb } = require(path.join(
  ROOT,
  'netlify/functions/lib/hybridExamWebExecute.js',
));

const result = await executeHybridLesenExamWeb({
  store,
  event,
  claudeHandler,
  plan,
  planMeta: planBody.meta,
  topic: 'Umwelt',
  vocab: WORDS,
  lang: 'de',
  level: 'B1',
  skipLive: SKIP_LIVE,
});

assert(result.trace.planSource === 'planHybridDecision', 'trace uses planHybridDecision');
assert(result.exam.lesenParts.length === (SKIP_LIVE ? 2 : 5), SKIP_LIVE ? 'pool-only: 2 parts' : '5 Lesen parts');

for (const cell of plan.fromPool) {
  const served = result.trace.pool.find((p) => p.teil === cell.teil);
  assert(served?.ok === true, `pool T${cell.teil} served (${cell.partId})`);
  const part = result.exam.lesenParts.find((p) => Number(p.teil) === Number(cell.teil));
  assert(part?._source === 'pool', `T${cell.teil} source=pool`);
  assert(part?._poolId === cell.partId, `T${cell.teil} poolId matches plan`);
}

if (!SKIP_LIVE) {
  for (const cell of plan.toGenerate) {
    const live = result.trace.live.find((l) => l.teil === cell.teil);
    assert(live?.ok === true, `live T${cell.teil} ok (factory + gate)`);
    const gate = result.trace.gates.find((g) => g.teil === cell.teil && g.source !== 'pool');
    assert(gate?.ok === true, `gate T${cell.teil} ok`);
  }
  assert(result.validation.valid === true, `ExamValidator OK (${result.validation.errors?.slice(0, 2).join('; ') || 'clean'})`);
}

// ── 3. HTTP endpoint (exam-hybrid-execute) ──
console.log('\n── exam-hybrid-execute (HTTP) ──');
delete require.cache[path.join(ROOT, 'netlify/functions/exam-hybrid-execute.js')];
const hybridExecuteHandler = require(path.join(
  ROOT,
  'netlify/functions/exam-hybrid-execute.js',
)).handler;

const ticketRes = await claudeHandler({
  httpMethod: 'POST',
  headers: event.headers,
  body: JSON.stringify({
    startGeneration: true,
    scope: 'personal_exam',
    maxChunks: 1,
  }),
});
assert(ticketRes.statusCode === 200, 'startGeneration HTTP 200 for hybrid execute');
const ticketBody = handlerBody(ticketRes);
const genTicket = ticketBody.ticket;
assert(genTicket, 'genTicket issued');

const httpExecRes = await hybridExecuteHandler({
  httpMethod: 'POST',
  headers: event.headers,
  body: JSON.stringify({
    genTicket,
    plan,
    planMeta: planBody.meta,
    topic: 'Umwelt',
    vocab: WORDS,
    lang: 'de',
    level: 'B1',
    skipLive: SKIP_LIVE,
  }),
});
assert(httpExecRes.statusCode === 200, `exam-hybrid-execute HTTP 200 (got ${httpExecRes.statusCode})`);
const httpBody = handlerBody(httpExecRes);
assert(httpBody.ok === true, 'exam-hybrid-execute ok=true');
assert(httpBody.exam?.lesenParts?.length === (SKIP_LIVE ? 2 : 5), 'HTTP execute part count');
assert(httpBody.trace?.generator === 'factory', 'HTTP trace generator=factory');
if (!SKIP_LIVE) {
  assert(httpBody.validation?.valid === true, 'HTTP ExamValidator OK');
  assert(httpBody.genTicket, 'HTTP response includes genTicket for deliverGeneration');
}

console.log('\n── TRACE (lib execute) ──');
for (const p of result.trace.pool) {
  console.log(`  pool T${p.teil} ok=${p.ok} id=${p.partId || '—'}`);
}
for (const l of result.trace.live) {
  console.log(
    `  live T${l.teil} ok=${l.ok}${l.fallback ? ' (fallback)' : ''}${l.skipped ? ' (skipped)' : ''}${l.reason ? ` reason=${l.reason}` : ''}`,
  );
}

console.log(`\n${'─'.repeat(50)}`);
console.log(SKIP_LIVE ? 'Plan + pool web path OK (--skip-anthropic)' : 'Full web hybrid path OK (17/17-equivalent)');
console.log('Nota: UI aún no cableada — este test valida backend web (exam-plan + execute).\n');
