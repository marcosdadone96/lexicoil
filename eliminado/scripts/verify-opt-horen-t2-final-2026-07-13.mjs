#!/usr/bin/env node
/**
 * Final Hören T2 cell test post-optimization.
 * Run: NODE_OPTIONS=--use-system-ca node scripts/verify-opt-horen-t2-final-2026-07-13.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { runExamGenerator } from './lib/generatePartGeminiLib.mjs';
import { readGenerationCostLog, summarizeGenerationCost } from './lib/generationCostLog.mjs';

loadEnvFile();

const topic = process.argv[2] || 'Kultur';
const logBefore = readGenerationCostLog().length;

const argv = [
  '--module', 'horen',
  '--teil', '2',
  '--topic', topic,
  '--count', '1',
  '--from-coverage',
  '--max-api-calls', '30',
  '--fix-retries', '3',
  '--write-file',
];

const t0 = Date.now();
const { results, session } = await runExamGenerator(argv);
const elapsedMs = Date.now() - t0;

const newEntries = readGenerationCostLog().slice(logBefore);
const costSummary = summarizeGenerationCost(newEntries);
const r = results?.[0] || {};

const baseline = {
  note: 'Peor celda OK medida hoy (Kultur): 8 calls, $0.1463',
  calls: 8,
  costUsd: 0.1463,
  topic: 'Kultur',
  file: 'horen-t2-gemini-026.json',
};

const out = {
  generatedAt: new Date().toISOString(),
  topic,
  elapsedMs,
  result: {
    ok: r.ok,
    attempts: r.attempts,
    reason: r.reason,
    file: r.file,
    localizedRepair: r.localizedRepair || null,
  },
  session: {
    apiCallsUsed: session.apiCallsUsed,
    model: session.model,
  },
  costThisRun: {
    calls: costSummary.calls,
    costUsd: costSummary.totalCostUsd,
    thoughtsTokens: costSummary.thoughtsTokens,
    surgicalCalls: newEntries.filter((e) => e.promptTokens < 2000 && e.candidatesTokens < 600).length,
    surgicalThoughts: newEntries
      .filter((e) => e.promptTokens < 2000 && e.candidatesTokens < 600)
      .reduce((s, e) => s + (e.thoughtsTokens || 0), 0),
  },
  baseline,
  deltaVsBaseline: {
    callsSaved: baseline.calls - costSummary.calls,
    costSavedUsd: baseline.costUsd - costSummary.totalCostUsd,
  },
};

const outPath = path.join(ROOT, 'batches/ready/gate-logs/verify-opt-horen-t2-final-2026-07-13.json');
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
