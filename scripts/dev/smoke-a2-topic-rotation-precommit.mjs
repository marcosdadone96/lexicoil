#!/usr/bin/env node
/**
 * Pre-commit smoke: 1 A2 cell per module (skip Lesen T4), auto topic rotation (no --topic).
 * Validates chosen topic ∈ A2_OFFICIAL_TOPICS and reports generation cost.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from '../lib/loadEnv.mjs';
import { generatedDir } from '../lib/batchPaths.mjs';
import {
  GENERATION_COST_LOG,
  readGenerationCostLog,
} from '../lib/generationCostLog.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const { A2_OFFICIAL_TOPICS } = require(path.join(ROOT, 'js/data/a2Topics.js'));

const CELLS = [
  { module: 'lesen', teil: 1, cmd: ['node', 'scripts/generate-lesen-part-gemini.mjs'] },
  { module: 'horen', teil: 1, cmd: ['node', 'scripts/generate-part-gemini.mjs', '--module', 'horen'] },
  { module: 'schreiben', teil: 1, cmd: ['node', 'scripts/generate-part-gemini.mjs', '--module', 'schreiben'] },
  { module: 'sprechen', teil: 1, cmd: ['node', 'scripts/generate-part-gemini.mjs', '--module', 'sprechen'] },
];

const COMMON = [
  '--level', 'A2',
  '--from-coverage',
  '--skip-pool-ready',
  '--fix-retries', '1',
  '--max-api-calls', '8',
  '--count', '1',
];

function costBeforeRun() {
  const rows = readGenerationCostLog();
  return { count: rows.length, lastAt: rows.at(-1)?.at || null };
}

function costDelta(beforeCount) {
  const rows = readGenerationCostLog();
  const delta = rows.slice(beforeCount);
  const totalUsd = delta.reduce((s, e) => s + (Number(e.costUsd) || 0), 0);
  const calls = delta.length;
  return { delta, totalUsd, calls };
}

function parseTemaFromOutput(text) {
  const m = text.match(/^Tema:\s*(.+?)(?:\s+\(elegido\)|\s+\(rotación\))?$/m);
  return m ? m[1].trim() : null;
}

function newestBatchFile(module, teil, afterMs) {
  const dir = generatedDir('A2');
  if (!fs.existsSync(dir)) return null;
  const prefix = `${module}-t${teil}-`;
  let best = null;
  let bestMtime = afterMs;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    if (!name.toLowerCase().startsWith(prefix)) continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.mtimeMs >= afterMs && st.mtimeMs >= bestMtime) {
      bestMtime = st.mtimeMs;
      best = abs;
    }
  }
  return best;
}

function readBatchTopic(abs) {
  if (!abs || !fs.existsSync(abs)) return { file: null, topicTag: null, requested: null };
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  return {
    file: path.relative(ROOT, abs).replace(/\\/g, '/'),
    topicTag: batch.topicTag || batch._requestedTopic || null,
    requested: batch._requestedTopic || null,
  };
}

const results = [];
let grandCost = 0;
let grandCalls = 0;
let allOk = true;

console.log('=== A2 topic-rotation pre-commit smoke (4 cells, no --topic) ===\n');
console.log(`Official axes: ${A2_OFFICIAL_TOPICS.join(', ')}\n`);

for (const cell of CELLS) {
  const label = `${cell.module} T${cell.teil}`;
  const before = costBeforeRun();
  const started = Date.now();
  const args = [...cell.cmd, '--teil', String(cell.teil), ...COMMON];
  console.log(`\n── ${label} ──`);
  console.log(`$ ${args.join(' ')}`);

  const proc = spawnSync(args[0], args.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });

  const out = `${proc.stdout || ''}${proc.stderr || ''}`;
  const temaLog = parseTemaFromOutput(out);
  const batchPath = newestBatchFile(cell.module, cell.teil, started - 2000);
  const batchMeta = readBatchTopic(batchPath);
  const topic = temaLog || batchMeta.topicTag || batchMeta.requested;
  const official = topic && A2_OFFICIAL_TOPICS.includes(topic);
  const { totalUsd, calls } = costDelta(before.count);
  grandCost += totalUsd;
  grandCalls += calls;

  const ok = proc.status === 0 && official;
  if (!ok) allOk = false;

  const row = {
    cell: label,
    exitCode: proc.status,
    temaLog,
    topicTag: batchMeta.topicTag,
    _requestedTopic: batchMeta.requested,
    topicResolved: topic,
    officialAxis: official,
    file: batchMeta.file,
    costUsd: Number(totalUsd.toFixed(6)),
    apiCallsLogged: calls,
    ok,
  };
  results.push(row);

  console.log(`  exit: ${proc.status}`);
  console.log(`  Tema (log): ${temaLog ?? '—'}`);
  console.log(`  topicTag: ${batchMeta.topicTag ?? '—'}`);
  console.log(`  official: ${official ? 'YES' : 'NO'} (${topic ?? 'missing'})`);
  console.log(`  file: ${batchMeta.file ?? '—'}`);
  console.log(`  cost: $${totalUsd.toFixed(4)} (${calls} log entries)`);
  if (!official && topic) {
    console.log(`  ⚠ topic "${topic}" is NOT an official A2 axis`);
  }
  if (proc.status !== 0) {
    console.log('  tail output:');
    console.log(out.split('\n').slice(-15).join('\n'));
  }
}

const reportPath = path.join(
  ROOT,
  'batches/ready/gate-logs/smoke-a2-topic-rotation-precommit.json',
);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      at: new Date().toISOString(),
      allOk,
      grandCostUsd: Number(grandCost.toFixed(6)),
      grandApiCallsLogged: grandCalls,
      officialTopics: A2_OFFICIAL_TOPICS,
      results,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log('\n=== SUMMARY ===');
for (const r of results) {
  console.log(
    `${r.ok ? '✅' : '❌'} ${r.cell}: topic=${r.topicResolved ?? '?'} official=${r.officialAxis} cost=$${r.costUsd.toFixed(4)} exit=${r.exitCode}`,
  );
}
console.log(`\nTotal cost (generation-cost.jsonl delta): $${grandCost.toFixed(4)} (${grandCalls} entries)`);
console.log(`Report: ${path.relative(ROOT, reportPath).replace(/\\/g, '/')}`);

process.exit(allOk ? 0 : 1);
