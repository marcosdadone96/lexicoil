#!/usr/bin/env node
/**
 * Benchmark gate pass rate — web (Gemini factory) vs terminal (shared factory).
 *
 *   ALLOW_LIVE_GEN=1 node scripts/benchmark-hybrid-gate-rate.mjs
 *   ALLOW_LIVE_GEN=1 node scripts/benchmark-hybrid-gate-rate.mjs --runs=4 --skip-terminal
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
process.env.AUTH_JWT_SECRET =
  process.env.AUTH_JWT_SECRET || process.env.LEXICOIL_JWT_SECRET || 'test-secret-at-least-16-chars!!';

const ARGS = process.argv.slice(2);
const WEB_RUNS = Number(ARGS.find((a) => a.startsWith('--runs='))?.split('=')[1] || process.env.BENCH_RUNS || 3);
const SKIP_TERMINAL = ARGS.includes('--skip-terminal');
const LIVE_TEILS = [3, 4, 5];

const WORDS = [
  'Klimawandel', 'Mülltrennung', 'Recycling', 'Plastik', 'Energie',
  'Umwelt', 'Nachhaltigkeit', 'Naturschutz', 'erneuerbar', 'Klima',
];

class MemoryBlobStore {
  constructor() {
    this.blobs = new Map();
    this.etagSeq = 0;
  }
  async get(key, opts = {}) {
    const row = this.blobs.get(key);
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
  async setJSON(key, data) {
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

function classifyLiveTeil(trace, teil) {
  const live = trace.live?.find((l) => Number(l.teil) === Number(teil));
  if (!live) return { outcome: 'missing', live };
  if (live.ok && !live.fallback) return { outcome: 'gate_pass', live };
  if (live.ok && live.fallback) return { outcome: 'fallback', live };
  return { outcome: 'failed', live };
}

function summarizeGateAttempts(attempts, teil) {
  return (attempts || [])
    .filter((a) => a.teil == null || Number(a.teil) === Number(teil))
    .map((a) => ({
      teil: a.teil,
      attempt: a.attempt,
      error: a.error,
      gate: a.gate,
      firstBlocking: a.blocking?.[0]?.id,
      firstMessage: a.blocking?.[0]?.message || a.message,
    }));
}

function setupWebAuth(store) {
  require(path.join(ROOT, 'netlify/functions/lib/blobStore.js')).getStoreForEvent = () => store;
  const { signAuthToken, userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
  const quotaLib = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js'));
  const email = 'bench-gate@test.com';
  return { signAuthToken, userKey, quotaLib, email };
}

async function resetProQuota(store, { userKey, signAuthToken, quotaLib, email }) {
  await store.setJSON(userKey(email), {
    email,
    name: 'Bench',
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
  const { token } = signAuthToken(email, 'Bench', 1);
  return {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  };
}

async function runWebOnce(runIdx) {
  const store = new MemoryBlobStore();
  const auth = setupWebAuth(store);
  const event = await resetProQuota(store, auth);

  const examPlanHandler = require(path.join(ROOT, 'netlify/functions/exam-plan.js')).handler;
  delete require.cache[path.join(ROOT, 'netlify/functions/claude-chat.js')];
  delete require.cache[path.join(ROOT, 'netlify/functions/lib/hybridExamWebExecute.js')];
  const claudeHandler = require(path.join(ROOT, 'netlify/functions/claude-chat.js')).handler;
  const { executeHybridLesenExamWeb } = require(path.join(
    ROOT,
    'netlify/functions/lib/hybridExamWebExecute.js',
  ));

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
  const planBody = JSON.parse(planRes.body);

  const t0 = Date.now();
  const result = await executeHybridLesenExamWeb({
    store,
    event,
    claudeHandler,
    plan: planBody.plan,
    topic: 'Umwelt',
    vocab: WORDS,
    lang: 'de',
    level: 'B1',
  });
  const ms = Date.now() - t0;

  const byTeil = {};
  for (const t of LIVE_TEILS) {
    byTeil[t] = classifyLiveTeil(result.trace, t);
    byTeil[t].gateAttempts = summarizeGateAttempts(result.trace.gateAttempts, t);
  }

  return { run: runIdx, ms, byTeil, gateAttempts: result.trace.gateAttempts || [] };
}

async function runTerminalOnce() {
  const { assembleHybridLesenModule } = await import('./lib/hybridLesenAssembly.mjs');
  const t0 = Date.now();
  const result = await assembleHybridLesenModule({
    topicTag: 'Umwelt',
    words: WORDS,
    lang: 'de',
    level: 'B1',
    live: true,
  });
  const ms = Date.now() - t0;

  const byTeil = {};
  for (const t of LIVE_TEILS) {
    const live = result.trace.live.find((l) => Number(l.teil) === t);
    let outcome = 'failed';
    if (live?.ok && !live.fallback) outcome = 'gate_pass';
    else if (live?.ok && live.fallback) outcome = 'fallback';
    const gate = result.trace.gates.find((g) => Number(g.teil) === t && g.source !== 'pool');
    byTeil[t] = {
      outcome,
      live,
      terminalGate: gate
        ? {
            ok: gate.ok,
            source: gate.source,
            blocking: (gate.blocking || []).map((b) => ({ id: b.id, message: b.message })),
          }
        : null,
    };
  }
  return { ms, byTeil };
}

function aggregateWebRuns(runs) {
  const totals = { gate_pass: 0, fallback: 0, failed: 0, cells: 0 };
  const byTeil = Object.fromEntries(LIVE_TEILS.map((t) => [t, { gate_pass: 0, fallback: 0, failed: 0 }]));
  const blockingCounts = new Map();

  for (const run of runs) {
    for (const t of LIVE_TEILS) {
      const o = run.byTeil[t].outcome;
      totals.cells += 1;
      totals[o] += 1;
      byTeil[t][o] += 1;
      for (const a of run.byTeil[t].gateAttempts || []) {
        const key = a.firstBlocking || a.error || 'unknown';
        blockingCounts.set(key, (blockingCounts.get(key) || 0) + 1);
      }
    }
  }

  return {
    runs: runs.length,
    passRate: totals.cells ? (totals.gate_pass / totals.cells) * 100 : 0,
    passPerRun: totals.gate_pass / runs.length,
    totals,
    byTeil,
    topBlocking: [...blockingCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

async function main() {
  if (process.env.ALLOW_LIVE_GEN !== '1' && process.env.ALLOW_LIVE_GEN !== 'true') {
    console.error('Requires ALLOW_LIVE_GEN=1');
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error('Web benchmark requires GEMINI_API_KEY');
    process.exit(1);
  }

  console.log(`\n══ Gate rate benchmark — ${WEB_RUNS} web runs (Gemini factory) ══\n`);

  const webRuns = [];
  for (let i = 1; i <= WEB_RUNS; i++) {
    console.log(`── Web run ${i}/${WEB_RUNS} ──`);
    try {
      const r = await runWebOnce(i);
      webRuns.push(r);
      const line = LIVE_TEILS.map((t) => `T${t}:${r.byTeil[t].outcome}`).join(' ');
      console.log(`  ${line}  (${(r.ms / 1000).toFixed(0)}s)`);
      for (const t of LIVE_TEILS) {
        const attempts = r.byTeil[t].gateAttempts;
        if (attempts?.length) {
          const sample = attempts.slice(0, 2).map((a) => a.firstBlocking || a.error).join(', ');
          console.log(`    T${t} rejections (${attempts.length}): ${sample}`);
        }
      }
    } catch (err) {
      console.error(`  RUN ${i} ERROR:`, err.message);
      webRuns.push({ run: i, error: err.message });
    }
  }

  const agg = aggregateWebRuns(webRuns.filter((r) => r.byTeil));
  console.log('\n── Web aggregate ──');
  console.log(`  Live cells: ${agg.totals.cells} (${WEB_RUNS} runs × 3 teils)`);
  console.log(`  Gate pass: ${agg.totals.gate_pass} (${agg.passRate.toFixed(1)}%)`);
  console.log(`  Fallback pool: ${agg.totals.fallback}`);
  console.log(`  Failed (no part): ${agg.totals.failed}`);
  console.log(`  Mean live passes per run: ${agg.passPerRun.toFixed(2)} / 3`);
  for (const t of LIVE_TEILS) {
    const b = agg.byTeil[t];
    const n = webRuns.filter((r) => r.byTeil).length || 1;
    console.log(`  T${t}: pass ${b.gate_pass}/${n}  fallback ${b.fallback}/${n}`);
  }
  if (agg.topBlocking.length) {
    console.log('  Top blocking ids:');
    for (const [id, n] of agg.topBlocking) {
      console.log(`    ${id}: ${n}×`);
    }
  }

  if (!SKIP_TERMINAL) {
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      console.log('\n── Terminal skipped (no GEMINI_API_KEY) ──');
    } else {
      console.log('\n── Terminal run 1× (Gemini spawn) ──');
      try {
        const term = await runTerminalOnce();
        const line = LIVE_TEILS.map((t) => `T${t}:${term.byTeil[t].outcome}`).join(' ');
        console.log(`  ${line}  (${(term.ms / 1000).toFixed(0)}s)`);
        for (const t of LIVE_TEILS) {
          const g = term.byTeil[t].terminalGate;
          if (g?.blocking?.length) {
            console.log(`    T${t} last gate: ${g.blocking.map((b) => b.id).join(', ')}`);
          }
        }
      } catch (err) {
        console.error('  Terminal ERROR:', err.message);
      }
    }
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
