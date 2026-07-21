#!/usr/bin/env node
/**
 * Pilot: repair 5 quarantined Lesen T5 pool files (measurement only — no pool writes).
 *   node scripts/pilot-repair-t5-quarantine-sample.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { listPoolVerifiedJson } from './lib/batchPaths.mjs';
import { generateContent } from './lib/geminiClient.mjs';
import {
  collectMcqLengthBiasIssues,
  checkMcqQuestionLengthBias,
} from './lib/mcqLengthBias.mjs';
import { repairMcqLengthBiasBatch } from './lib/mcqLengthBiasRepair.mjs';
import { wrapSurgicalCallLlm, SURGICAL_THINKING_CONFIG } from './lib/surgicalRepairRouter.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { poolReadyCheck } from './lib/poolReadyCheck.mjs';
import {
  costUsdFromTokens,
  parseUsageMetadata,
  readGenerationCostLog,
} from './lib/generationCostLog.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const { batchHasOfficialQuarantine } = require(
  path.join(ROOT, 'netlify/functions/lib/officialQuarantine.js'),
);

const SAMPLE = [
  'lesen-t5-gemini-014.json',
  'lesen-t5-gemini-036.json',
  'lesen-t5-gemini-057.json',
  'lesen-t5-gemini-063.json',
  'lesen-t5-gemini-023.json',
];

const GRAMMAR_FILE = 'lesen-t5-gemini-050.json';

function poolPath(file) {
  return listPoolVerifiedJson('B1').find((abs) => path.basename(abs) === file);
}

function countStamps(batch) {
  const qs = batch.questions || [];
  return {
    length: qs.filter((q) => q._lengthBiasQuarantine).length,
    lexical: qs.filter((q) => q._lexicalCueingQuarantine).length,
  };
}

function clearStaleQuarantine(batch) {
  const out = structuredClone(batch);
  for (const q of out.questions || []) {
    const r = checkMcqQuestionLengthBias(q, { gate: false, level: 'B1' });
    if (!r.bad) delete q._lengthBiasQuarantine;
  }
  return out;
}

async function callLlm(opts) {
  const res = await generateContent({
    ...opts,
    thinkingConfig: SURGICAL_THINKING_CONFIG,
    jsonMode: true,
  });
  const usage = parseUsageMetadata(res.usageMetadata || res.usage);
  const costUsd = costUsdFromTokens(
    usage.promptTokens,
    usage.outputTokensBilled,
    usage.cachedContentTokenCount,
  );
  return { text: res.text, usage, costUsd };
}

async function evaluateOfficialReady(batch, file) {
  const quality = checkLesenBatchQuality(batch, 5);
  const poolGate = await poolReadyCheck(batch, {
    file,
    sourcePath: `batches/ready/pool-verified/B1/${file}`,
    semantic: false,
    skipSem2: true,
  });
  const quarantine = batchHasOfficialQuarantine(batch);
  return {
    qualityOk: quality.ok,
    qualityIssues: (quality.issues || []).slice(0, 5),
    poolReadyOk: poolGate.verdict === 'READY',
    poolReadyIssue: poolGate.rejectReasons?.join('; ') || poolGate.issue,
    officialQuarantine: quarantine,
    officialReady: quality.ok && poolGate.verdict === 'READY' && !quarantine,
  };
}

async function repairOneWithCost(file) {
  const abs = poolPath(file);
  if (!abs) return { file, error: 'not found' };

  const before = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const stampsBefore = countStamps(before);
  const issues = collectMcqLengthBiasIssues(before, { gate: true, level: 'B1' });
  for (const q of before.questions || []) {
    if (q._lengthBiasQuarantine && !issues.some((i) => i.startsWith(`${q.id}:`))) {
      const r = checkMcqQuestionLengthBias(q, { gate: false, level: 'B1' });
      if (r.detail) issues.push(r.detail);
    }
  }

  let costUsd = 0;
  let repaired = null;
  if (issues.length) {
    const trackedCallLlm = wrapSurgicalCallLlm(async (opts) => {
      const r = await callLlm(opts);
      costUsd += r.costUsd;
      return r;
    });
    repaired = await repairMcqLengthBiasBatch(before, 5, issues, trackedCallLlm, {
      module: 'lesen',
      level: 'B1',
    });
  }

  let batch = repaired || before;
  batch = applyGermanCapsNormalize(batch, { level: 'B1' }).batch;
  batch = clearStaleQuarantine(batch);
  const evalResult = await evaluateOfficialReady(batch, file);

  return {
    file,
    stampsBefore,
    issuesForRepair: issues.length,
    llmRepaired: !!repaired,
    stampsAfter: countStamps(batch),
    costUsd,
    ...evalResult,
  };
}

async function testGrammarFile() {
  const abs = poolPath(GRAMMAR_FILE);
  if (!abs) return { file: GRAMMAR_FILE, error: 'not found' };
  let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const before = await evaluateOfficialReady(batch, GRAMMAR_FILE);
  const caps = applyGermanCapsNormalize(batch, { level: 'B1' });
  batch = caps.batch;
  const after = await evaluateOfficialReady(batch, GRAMMAR_FILE);
  return {
    file: GRAMMAR_FILE,
    capsChanges: caps.changes?.length ?? 0,
    before,
    after,
    capsFixOnly: !before.officialReady && after.officialReady,
  };
}

function generationCostBaseline() {
  const log = readGenerationCostLog();
  const byFile = new Map();
  for (const e of log) {
    if (e.module !== 'lesen' || e.teil !== 5) continue;
    if (!e.file) continue;
    const row = byFile.get(e.file) || { calls: 0, costUsd: 0, ok: false };
    row.calls++;
    row.costUsd += e.costUsd || 0;
    if (e.ok) row.ok = true;
    byFile.set(e.file, row);
  }
  const successes = [...byFile.entries()].filter(([, v]) => v.ok);
  const costs = successes.map(([, v]) => v.costUsd);
  const avg = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
  const surgicalOnly = log.filter(
    (e) =>
      e.module === 'lesen' &&
      e.teil === 5 &&
      e.promptTokens < 2500 &&
      (e.candidatesTokens || 0) < 800,
  );
  const surgAvg = surgicalOnly.length
    ? surgicalOnly.reduce((s, e) => s + (e.costUsd || 0), 0) / surgicalOnly.length
    : 0;
  return {
    successfulParts: successes.length,
    avgCostPerSuccessfulPartUsd: Number(avg.toFixed(4)),
    medianCostUsd: Number(
      costs.sort((a, b) => a - b)[Math.floor(costs.length / 2)]?.toFixed(4) || 0,
    ),
    avgSurgicalCallUsd: Number(surgAvg.toFixed(4)),
    note: 'from generation-cost.jsonl historical lesen T5',
  };
}

console.log('Pilot repair sample — 5 quarantined Lesen T5 files\n');
const finalResults = [];
let totalRepairCost = 0;
for (const file of SAMPLE) {
  process.stdout.write(`${file}… `);
  const row = await repairOneWithCost(file);
  finalResults.push(row);
  totalRepairCost += row.costUsd;
  console.log(row.officialReady ? 'OFFICIAL-READY' : `fail (${row.qualityIssues?.[0] || row.poolReadyIssue || 'quarantine'})`);
}

const grammar = await testGrammarFile();
const baseline = generationCostBaseline();
const ready = finalResults.filter((r) => r.officialReady).length;

const report = {
  generatedAt: new Date().toISOString(),
  sampleSize: SAMPLE.length,
  officialReady: ready,
  successRate: ready / SAMPLE.length,
  totalRepairCostUsd: Number(totalRepairCost.toFixed(4)),
  avgRepairCostUsd: Number((totalRepairCost / SAMPLE.length).toFixed(4)),
  costPerSuccessUsd: ready ? Number((totalRepairCost / ready).toFixed(4)) : null,
  extrapolate21: {
    expectedSuccesses: Math.round(21 * (ready / SAMPLE.length)),
    costIfSameRateUsd: Number(((totalRepairCost / SAMPLE.length) * 21).toFixed(2)),
    costPerSuccessUsd: ready ? Number((totalRepairCost / ready).toFixed(4)) : null,
  },
  extrapolate8New: {
    costUsd: Number((baseline.avgCostPerSuccessfulPartUsd * 8).toFixed(2)),
    perPartUsd: baseline.avgCostPerSuccessfulPartUsd,
  },
  generationBaseline: baseline,
  grammarCapsOnly: grammar,
  rows: finalResults,
};

const out = path.join(ROOT, 'batches/ready/gate-logs/pilot-repair-t5-quarantine-sample-2026-07-16.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log('\n' + JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.relative(ROOT, out)}`);
