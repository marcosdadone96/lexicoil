#!/usr/bin/env node
/**
 * Chunked hybrid E2E — one exam-hybrid-execute call per phase (prod 60s budget).
 *
 *   ALLOW_LIVE_GEN=1 node scripts/test-hybrid-exam-chunked-e2e.mjs
 *   node scripts/test-hybrid-exam-chunked-e2e.mjs --skip-live   # pool call only
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

const SKIP_LIVE = process.argv.includes('--skip-live');
const ALLOW_LIVE = process.env.ALLOW_LIVE_GEN === '1' || process.env.ALLOW_LIVE_GEN === 'true';
const MAX_CALL_MS = 60_000;

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

function handlerBody(res) {
  return typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
}

function makeEvent(authToken) {
  return {
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
    },
  };
}

const store = new MemoryBlobStore();
require(path.join(ROOT, 'netlify/functions/lib/blobStore.js')).getStoreForEvent = () => store;

const { signAuthToken, userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const quotaLibPath = path.join(ROOT, 'netlify/functions/lib/quotaLib.js');
delete require.cache[quotaLibPath];
const quotaLib = require(quotaLibPath);

const email = 'hybrid-chunked@test.com';
await store.setJSON(userKey(email), {
  email,
  name: 'Hybrid Chunked Test',
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

const { token: authToken } = signAuthToken(email, 'Hybrid Chunked Test', 1);
const event = makeEvent(authToken);

console.log('\n══════════════════════════════════════════════════════════');
console.log(' CHUNKED HYBRID E2E — pool call + one call per live Teil');
console.log(` ALLOW_LIVE_GEN=${process.env.ALLOW_LIVE_GEN || '(unset)'}`);
console.log(` Live: ${SKIP_LIVE ? 'SKIPPED (--skip-live)' : ALLOW_LIVE ? 'YES' : 'NO'}`);
console.log('══════════════════════════════════════════════════════════\n');

if (!SKIP_LIVE && !ALLOW_LIVE) {
  console.error('  ❌ Live path requires ALLOW_LIVE_GEN=1 (or --skip-live)');
  process.exit(1);
}
if (!SKIP_LIVE && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
  console.error('  ❌ Live path requires GEMINI_API_KEY');
  process.exit(1);
}

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
assert(plan.fromPool.length >= 1, 'fromPool ≥ 1');
assert(plan.toGenerate.length >= 1, 'toGenerate ≥ 1');
assert(
  plan.toGenerate.filter((c) => [1, 2].includes(Number(c.teil))).length <= 1,
  'máximo 1 slow live',
);
console.log(`  plan pool: [${plan.fromPool.map((p) => `T${p.teil}`).join(', ')}] live: [${plan.toGenerate.map((c) => `T${c.teil}`).join(' → ')}]`);

delete require.cache[path.join(ROOT, 'netlify/functions/claude-chat.js')];
const claudeHandler = require(path.join(ROOT, 'netlify/functions/claude-chat.js')).handler;
delete require.cache[path.join(ROOT, 'netlify/functions/exam-hybrid-execute.js')];
const hybridExecuteHandler = require(path.join(
  ROOT,
  'netlify/functions/exam-hybrid-execute.js',
)).handler;

const liveCount = Math.max(1, plan.toGenerate.length);
const ticketRes = await claudeHandler({
  httpMethod: 'POST',
  headers: event.headers,
  body: JSON.stringify({
    startGeneration: true,
    scope: 'personal_exam',
    maxChunks: liveCount,
  }),
});
assert(ticketRes.statusCode === 200, 'startGeneration HTTP 200');
const genTicket = handlerBody(ticketRes).ticket;
assert(genTicket, 'genTicket issued');

const baseBody = {
  genTicket,
  plan,
  planMeta: planBody.meta,
  topic: 'Umwelt',
  vocab: WORDS,
  lang: 'de',
  level: 'B1',
};

const callTimings = [];

async function runChunk(label, body) {
  const t0 = Date.now();
  const res = await hybridExecuteHandler({
    httpMethod: 'POST',
    headers: event.headers,
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  callTimings.push({ label, ms, status: res.statusCode });
  console.log(`  ${label}: ${ms}ms HTTP ${res.statusCode}`);
  assert(res.statusCode === 200, `${label} HTTP 200 (got ${res.statusCode})`);
  assert(ms < MAX_CALL_MS, `${label} finished in <60s (${ms}ms)`);
  return handlerBody(res);
}

console.log('\n── call 1: pool T1+T2 (skipLive) ──');
let partial = await runChunk('pool', {
  ...baseBody,
  skipLive: true,
  validateExam: false,
});
assert(partial.exam?.lesenParts?.length === 2, 'pool call returns 2 Lesen parts');
assert(partial.trace?.pool?.every((p) => p.ok), 'pool trace all ok');

if (SKIP_LIVE) {
  console.log('\n── skip-live: chunked pool path OK ──');
  console.log(`Timings: ${callTimings.map((t) => `${t.label}=${t.ms}ms`).join(', ')}\n`);
  process.exit(0);
}

let partialExam = partial.exam;
let partialTrace = partial.trace;

for (let i = 0; i < plan.toGenerate.length; i++) {
  const cell = plan.toGenerate[i];
  const isLast = i === plan.toGenerate.length - 1;
  console.log(`\n── call ${i + 2}: onlyLiveTeil=${cell.teil} ──`);
  partial = await runChunk(`T${cell.teil}`, {
    ...baseBody,
    onlyLiveTeil: cell.teil,
    includePool: false,
    partialExam,
    partialTrace,
    validateExam: isLast,
  });
  partialExam = partial.exam;
  partialTrace = partial.trace;
}

assert(partial.exam?.lesenParts?.length === 5, 'final exam has 5 Lesen parts');
assert(partial.validation?.valid === true, `final validation OK (${partial.validation?.errors?.slice(0, 2).join('; ') || 'clean'})`);

console.log('\n── per-call timings ──');
for (const t of callTimings) {
  console.log(`  ${t.label}: ${t.ms}ms`);
}
console.log(`\n${'─'.repeat(50)}`);
console.log('Chunked hybrid path OK — each call <60s, exam assembled teil-by-teil.\n');
