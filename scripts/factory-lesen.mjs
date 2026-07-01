#!/usr/bin/env node
/**
 * factory-lesen.mjs — Genera Lesen B1 en volumen sin agotar cuota Gemini gratuita.
 *
 * Flujo:
 *   1. vocab-coverage-report --source blobs → data/coverage/weak-de_B1.json
 *   2. Bucle por Teil más vacío hasta --per-teil-target (default 50)
 *   3. T1/T2/T4/T5 → generate-lesen-part-gemini.mjs (--words lote 8-12 lemas flojos)
 *   4. T3 → make-t3.mjs (0 API) + validate-batch
 *   5. publish-lesen-generated.mjs + re-medición cobertura
 *
 * Cuota: --model flash/flash-lite · pausa 6s · --max-api-calls 150 · 429 → 60s ×1
 *
 *   node scripts/factory-lesen.mjs
 *   node scripts/factory-lesen.mjs --per-teil-target 50 --max-api-calls 100
 *   node scripts/factory-lesen.mjs --skip-publish --max-api-calls 5
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { resolveLesenModel } from './generate-lesen-part-gemini.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

const { listPartsIndex } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const { STORE_NAME } = require(path.join(ROOT, 'netlify/functions/lib/blobStore.js'));

const TEILE = [1, 2, 3, 4, 5];
const GEMINI_TEILE = [1, 2, 4, 5];
const MIN_PAUSE_MS = 6000;
const EXIT_DAILY = 2;
const EXIT_429 = 3;
const EXIT_BUDGET = 4;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const o = {
    lang: 'de',
    level: 'B1',
    model: null,
    maxApiCalls: 150,
    perTeilTarget: 50,
    pauseMs: MIN_PAUSE_MS,
    skipPublish: false,
    dryRun: false,
    batchMin: 8,
    batchMax: 12,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--model') o.model = String(argv[++i]).trim();
    else if (a === '--max-api-calls') o.maxApiCalls = Math.max(1, Number(argv[++i]) || 150);
    else if (a === '--per-teil-target') o.perTeilTarget = Math.max(1, Number(argv[++i]) || 50);
    else if (a === '--pause-ms') o.pauseMs = Math.max(MIN_PAUSE_MS, Number(argv[++i]) || MIN_PAUSE_MS);
    else if (a === '--skip-publish') o.skipPublish = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  o.pauseMs = Math.max(MIN_PAUSE_MS, o.pauseMs);
  return o;
}

function warnTlsOnWindows() {
  if (process.platform !== 'win32') return;
  if (process.env.NODE_OPTIONS?.includes('use-system-ca')) return;
  console.warn('WARN: En Windows + Blobs, usa $env:NODE_OPTIONS="--use-system-ca"');
}

function buildEnv() {
  const env = { ...process.env };
  const extra = '--use-system-ca';
  if (!env.NODE_OPTIONS?.includes('use-system-ca')) {
    env.NODE_OPTIONS = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ${extra}` : extra;
  }
  return env;
}

function runScript(relScript, args, { label, capture = false } = {}) {
  if (label) console.log(`\n→ ${label}`);
  const res = spawnSync(process.execPath, [relScript, ...args], {
    cwd: ROOT,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    env: buildEnv(),
    maxBuffer: capture ? 20 * 1024 * 1024 : undefined,
  });
  if (capture) {
    const output = `${res.stdout || ''}${res.stderr || ''}`;
    if (output.trim()) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
    return { status: res.status ?? 1, output };
  }
  return { status: res.status ?? 1, output: '' };
}

function loadWeakLemmas(lang, level) {
  const file = path.join(ROOT, 'data', 'coverage', `weak-${lang}_${level}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No existe ${path.relative(ROOT, file)} — ejecuta vocab-coverage-report.mjs`);
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const detail = Array.isArray(data.detail)
    ? data.detail
    : (data.weakLemmas || []).map((lemma) => ({ lemma, parts: 0 }));
  detail.sort((a, b) => a.parts - b.parts || String(a.lemma).localeCompare(String(b.lemma)));
  return detail;
}

function getStore() {
  const { getStore: gs } = require('@netlify/blobs');
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) {
    throw new Error('Faltan NETLIFY_SITE_ID + NETLIFY_API_TOKEN para medir/publicar pool');
  }
  return gs({ name: STORE_NAME, siteID, token });
}

async function countLesenPool(lang, level) {
  const store = getStore();
  const entries = await listPartsIndex(store, lang, level, 'lesen');
  const byTeil = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const e of entries) {
    if (e.disabled || !e.complete || !e.verified) continue;
    const t = Number(e.teil);
    if (byTeil[t] !== undefined) byTeil[t] += 1;
  }
  return byTeil;
}

function pickBatchSize(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickWordBatch(detail, cursor, min, max) {
  if (!detail.length) return { words: [], nextCursor: 0 };
  const size = pickBatchSize(min, max);
  const ordered = [...detail.filter((d) => d.parts === 0), ...detail.filter((d) => d.parts > 0)];
  const words = [];
  for (let i = 0; i < size; i++) {
    words.push(ordered[(cursor + i) % ordered.length].lemma);
  }
  return { words, nextCursor: cursor + size };
}

function pickNextTeil(poolCounts, sessionCounts, target) {
  const ranked = TEILE.map((teil) => {
    const pool = poolCounts[teil] || 0;
    const session = sessionCounts[teil] || 0;
    const total = pool + session;
    return { teil, pool, total, gap: target - total };
  })
    .filter((r) => r.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.pool - b.pool || a.teil - b.teil);
  return ranked[0]?.teil ?? null;
}

function parseApiCallsFromOutput(output) {
  const m = output.match(/Llamadas API usadas:\s*(\d+)/i);
  return m ? Number(m[1]) : 0;
}

function parseSavedFile(output) {
  const m = output.match(/Guardado:\s+(\S+\.json)/i);
  return m ? m[1].replace(/\\/g, '/') : null;
}

function childStopReason(status, output) {
  if (status === EXIT_DAILY) return 'daily-quota';
  if (status === EXIT_429) return '429';
  if (status === EXIT_BUDGET) return 'max-api-calls';
  if (/cuota diaria alcanzada|429 persistente|Presupuesto --max-api-calls/i.test(output)) {
    return status === EXIT_429 ? '429' : 'max-api-calls';
  }
  return null;
}

function runGenerateLesen(opts, { teil, words, apiBudget }) {
  const args = [
    '--lang',
    opts.lang,
    '--level',
    opts.level,
    '--teil',
    String(teil),
    '--words',
    words.join(','),
    '--model',
    opts.model,
    '--pause-ms',
    String(opts.pauseMs),
    '--api-retries',
    '1',
    '--fix-retries',
    '0',
    '--max-api-calls',
    String(Math.max(1, Math.min(apiBudget, 2))),
  ];
  const res = runScript('scripts/generate-lesen-part-gemini.mjs', args, {
    label: `generate-lesen T${teil} · ${words.slice(0, 4).join(', ')}${words.length > 4 ? '…' : ''}`,
    capture: true,
  });
  const apiCalls = parseApiCallsFromOutput(res.output);
  const file = parseSavedFile(res.output);
  const ok = res.status === 0 && /Validación técnica OK|Siguiente: node scripts\/ingest-to-staging/i.test(
    res.output,
  );
  return {
    ok,
    discarded: !ok,
    teil,
    file,
    apiCalls: apiCalls || (ok ? 1 : 0),
    stop: childStopReason(res.status, res.output),
  };
}

function runMakeT3(opts, words) {
  const args = [
    '--count',
    '1',
    '--out',
    'batches/generated',
    ...(words.length ? ['--words', words.join(',')] : []),
  ];
  const res = runScript('scripts/make-t3.mjs', args, {
    label: `make-t3 · ${words.slice(0, 4).join(', ') || 'sin vocab'}`,
    capture: true,
  });
  const match = res.output.match(/✅\s+(\S+\.json)/);
  if (!match) {
    return { ok: false, discarded: true, teil: 3, file: null, apiCalls: 0, stop: null };
  }
  const relFile = match[1].replace(/\\/g, '/');
  const val = runScript(
    'scripts/validate-batch.mjs',
    ['--lang', opts.lang, '--level', opts.level, '--file', relFile],
    { label: `validate-batch ${relFile}` },
  );
  const ok = val.status === 0;
  return { ok, discarded: !ok, teil: 3, file: ok ? relFile : null, apiCalls: 0, stop: null };
}

function coverageMetricsPath(lang, level) {
  return path.join(ROOT, 'data', 'coverage', `.metrics-${lang}_${level}-blobs.json`);
}

function runCoverageReport(opts) {
  const jsonOut = coverageMetricsPath(opts.lang, opts.level);
  console.log(
    '\nMedición cobertura Blobs (descarga ~300 payloads, suele tardar 3–6 min — ver progreso):',
  );
  const res = runScript(
    'scripts/vocab-coverage-report.mjs',
    [
      '--lang',
      opts.lang,
      '--level',
      opts.level,
      '--source',
      'blobs',
      '--json-out',
      path.relative(ROOT, jsonOut).replace(/\\/g, '/'),
    ],
    { label: 'vocab-coverage-report --source blobs' },
  );
  if (res.status !== 0) return null;
  if (!fs.existsSync(jsonOut)) return null;
  return JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
}

function publishGenerated(opts, filesByTeil) {
  const allFiles = TEILE.flatMap((t) => filesByTeil[t] || []);
  if (!allFiles.length) {
    console.log('\nNada que publicar en esta sesión.');
    return;
  }
  console.log(`\nPublicando ${allFiles.length} archivo(s) al banco + pool…`);
  runScript(
    'scripts/publish-lesen-generated.mjs',
    [
      '--lang',
      opts.lang,
      '--level',
      opts.level,
      '--files',
      allFiles.join(','),
      '--publish',
      '--sync-pool',
      '--allow-bank-dup',
      '--continue',
    ],
    { label: 'publish-lesen-generated --sync-pool' },
  );
}

function initSessionCounts() {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function printSummary({
  opts,
  poolBefore,
  poolAfter,
  coverageBefore,
  coverageAfter,
  sessionGenerated,
  sessionDiscarded,
  apiCallsUsed,
  stopped,
}) {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('RESUMEN FACTORY LESEN');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`Modelo: ${opts.model} · Llamadas API: ${apiCallsUsed}/${opts.maxApiCalls}`);
  if (stopped) console.log(`Detenido: ${stopped}`);
  console.log('\nPor Teil (generadas / descartadas / pool antes → después):');
  for (const t of TEILE) {
    const before = poolBefore[t] ?? 0;
    const after = poolAfter[t] ?? before;
    console.log(
      `  T${t}: +${sessionGenerated[t] || 0} generadas, ${sessionDiscarded[t] || 0} descartadas · pool ${before} → ${after}`,
    );
  }
  if (coverageBefore && coverageAfter) {
    console.log('\nCobertura global (blobs):');
    console.log(
      `  lemas 0 partes:     ${coverageBefore.cov0} → ${coverageAfter.cov0}`,
    );
    console.log(
      `  lemas ≥${coverageBefore.threshold} partes: ${coverageBefore.covT} → ${coverageAfter.covT}`,
    );
    console.log(
      `  lemas flojos (<${coverageBefore.threshold}): ${coverageBefore.weakCount} → ${coverageAfter.weakCount}`,
    );
  }
}

async function main() {
  warnTlsOnWindows();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/factory-lesen.mjs [options]
  --lang de --level B1
  --model gemini-2.5-flash
  --max-api-calls 150
  --per-teil-target 50
  --pause-ms 6000
  --skip-publish
  --dry-run`);
    process.exit(0);
  }

  opts.model = resolveLesenModel(opts.model);

  if (!opts.dryRun && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error('Falta GEMINI_API_KEY en .env');
    process.exit(1);
  }

  console.log(`\n══ factory-lesen · ${opts.lang}/${opts.level} ══`);
  console.log(
    `Objetivo: ${opts.perTeilTarget}/Teil · API max ${opts.maxApiCalls} · ${opts.model} · pausa ≥${opts.pauseMs}ms`,
  );

  const coverageBefore = runCoverageReport(opts);
  if (!coverageBefore) {
    console.error('No se pudo leer métricas de cobertura (--json).');
    process.exit(1);
  }

  const weakDetail = loadWeakLemmas(opts.lang, opts.level);
  const zeroCount = weakDetail.filter((w) => w.parts === 0).length;
  console.log(
    `\nLemas flojos: ${weakDetail.length} (${zeroCount} con 0 partes en pool global)`,
  );

  const poolBefore = await countLesenPool(opts.lang, opts.level);
  console.log('Pool lesen (activas) antes:', poolBefore);

  if (opts.dryRun) {
    console.log('\n[DRY-RUN] Plan de Teile pendientes:');
    for (const t of TEILE) {
      const gap = opts.perTeilTarget - (poolBefore[t] || 0);
      if (gap > 0) console.log(`  T${t}: faltan ~${gap} partes`);
    }
    process.exit(0);
  }

  const sessionGenerated = initSessionCounts();
  const sessionDiscarded = initSessionCounts();
  const filesByTeil = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  let apiCallsUsed = 0;
  let wordCursor = 0;
  let stopped = null;

  outer: while (true) {
    const teil = pickNextTeil(poolBefore, sessionGenerated, opts.perTeilTarget);
    if (teil == null) {
      console.log('\nObjetivo por Teil alcanzado (en sesión + pool inicial).');
      break;
    }

    const { words, nextCursor } = pickWordBatch(
      weakDetail,
      wordCursor,
      opts.batchMin,
      opts.batchMax,
    );
    wordCursor = nextCursor;

    if (teil !== 3 && apiCallsUsed >= opts.maxApiCalls) {
      stopped = 'max-api-calls';
      console.log('\ncuota diaria alcanzada, continúa mañana');
      break;
    }

    let result;
    if (teil === 3) {
      result = runMakeT3(opts, words);
    } else {
      const budgetLeft = opts.maxApiCalls - apiCallsUsed;
      result = runGenerateLesen(opts, { teil, words, apiBudget: budgetLeft });
      apiCallsUsed += result.apiCalls;
      if (result.apiCalls > 0 && apiCallsUsed < opts.maxApiCalls) {
        console.log(`Cola factory: pausa ${opts.pauseMs / 1000}s…`);
        await sleep(opts.pauseMs);
      }
    }

    if (result.ok && result.file) {
      sessionGenerated[teil] += 1;
      filesByTeil[teil].push(result.file);
      console.log(`✓ T${teil} OK → ${result.file}`);
    } else {
      sessionDiscarded[teil] += 1;
      console.log(`✗ T${teil} descartada${result.file ? ` (${result.file})` : ''}`);
    }

    if (result.stop) {
      stopped = result.stop;
      if (stopped === 'max-api-calls' || stopped === 'daily-quota') {
        console.log('\ncuota diaria alcanzada, continúa mañana');
      } else if (stopped === '429') {
        console.log('\nRate limit 429 persistente — para sin quemar más cuota.');
      }
      break outer;
    }

    if (apiCallsUsed >= opts.maxApiCalls) {
      const stillNeedGemini = TEILE.some(
        (t) =>
          GEMINI_TEILE.includes(t) &&
          poolBefore[t] + sessionGenerated[t] < opts.perTeilTarget,
      );
      if (stillNeedGemini) {
        stopped = 'max-api-calls';
        console.log('\ncuota diaria alcanzada, continúa mañana');
        break;
      }
    }
  }

  if (!opts.skipPublish) {
    publishGenerated(opts, filesByTeil);
  }

  const coverageAfter = runCoverageReport(opts);
  let poolAfter = poolBefore;
  try {
    poolAfter = await countLesenPool(opts.lang, opts.level);
  } catch (err) {
    console.warn(`No se pudo re-contar pool: ${err.message}`);
    for (const t of TEILE) {
      poolAfter[t] = (poolBefore[t] || 0) + (sessionGenerated[t] || 0);
    }
  }

  printSummary({
    opts,
    poolBefore,
    poolAfter,
    coverageBefore,
    coverageAfter,
    sessionGenerated,
    sessionDiscarded,
    apiCallsUsed,
    stopped,
  });

  process.exit(stopped ? (stopped === '429' ? EXIT_429 : EXIT_BUDGET) : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
