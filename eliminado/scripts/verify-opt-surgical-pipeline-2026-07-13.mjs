#!/usr/bin/env node
/**
 * Verify thinkingBudget:0 in real pipeline — generate parts that trigger surgical repairs.
 * Run: NODE_OPTIONS=--use-system-ca node scripts/verify-opt-surgical-pipeline-2026-07-13.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { runExamGenerator } from './lib/generatePartGeminiLib.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { readGenerationCostLog, summarizeGenerationCost } from './lib/generationCostLog.mjs';

loadEnvFile();

const logBefore = readGenerationCostLog().length;
const runs = [];

function isSurgicalCall(e) {
  return e.promptTokens < 2000 && e.candidatesTokens < 600;
}

// Cases likely to trigger word-copy / length-bias repairs (same families as today)
const CASES = [
  { label: 'horen-t2-kultur', kind: 'exam', argv: ['--module', 'horen', '--teil', '2', '--topic', 'Kultur', '--count', '1', '--from-coverage', '--max-api-calls', '25', '--fix-retries', '3', '--write-file'] },
  { label: 'horen-t2-gesundheit', kind: 'exam', argv: ['--module', 'horen', '--teil', '2', '--topic', 'Gesundheit', '--count', '1', '--from-coverage', '--max-api-calls', '25', '--fix-retries', '3', '--write-file'] },
  { label: 'horen-t2-freizeit', kind: 'exam', argv: ['--module', 'horen', '--teil', '2', '--topic', 'Freizeit', '--count', '1', '--from-coverage', '--max-api-calls', '25', '--fix-retries', '3', '--write-file'] },
  { label: 'lesen-t2-arbeit', kind: 'lesen', teil: 2, topic: 'Arbeit', words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma', 'Vertrag'] },
  { label: 'lesen-t2-umwelt', kind: 'lesen', teil: 2, topic: 'Umwelt', words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt', 'Naturschutz'] },
];

let sessionLesen = null;

for (const c of CASES) {
  const sliceBefore = readGenerationCostLog().length;
  let result;
  if (c.kind === 'exam') {
    const { results, session } = await runExamGenerator(c.argv);
    result = { ...(results?.[0] || {}), apiCallsUsed: session.apiCallsUsed };
  } else {
    if (!sessionLesen) {
      sessionLesen = createLesenFactorySession({
        lang: 'de',
        level: 'B1',
        writeFile: true,
        maxApiCalls: 80,
        semantic: true,
        skipSem2: true,
      });
    }
    result = await generateLesenPart({
      teil: c.teil,
      topic: c.topic,
      words: c.words,
      writeFile: true,
      session: sessionLesen,
      fixRetries: 3,
      semantic: true,
      skipSem2: true,
    });
  }
  const entries = readGenerationCostLog().slice(sliceBefore);
  const surgical = entries.filter(isSurgicalCall);
  const genCalls = entries.filter((e) => !isSurgicalCall(e));
  runs.push({
    label: c.label,
    ok: !!result.ok,
    file: result.file || null,
    attempts: result.attempts ?? null,
    apiCalls: entries.length,
    genCalls: genCalls.length,
    surgicalCalls: surgical.length,
    surgical: surgical.map((e) => ({
      promptTokens: e.promptTokens,
      candidatesTokens: e.candidatesTokens,
      thoughtsTokens: e.thoughtsTokens || 0,
      costUsd: e.costUsd,
    })),
    surgicalThoughtsTotal: surgical.reduce((s, e) => s + (e.thoughtsTokens || 0), 0),
    surgicalCostUsd: surgical.reduce((s, e) => s + (e.costUsd || 0), 0),
  });
}

const allNew = readGenerationCostLog().slice(logBefore);
const allSurgical = allNew.filter(isSurgicalCall);
const preFixBaseline = { avgCostUsd: 0.006, avgThoughts: 185, note: 'pre-fix surgical avg from today smoke (~185-3594 thoughts/call)' };

const out = {
  generatedAt: new Date().toISOString(),
  runs,
  aggregate: {
    totalCalls: allNew.length,
    surgicalCalls: allSurgical.length,
    surgicalAllThoughtsZero: allSurgical.every((e) => (e.thoughtsTokens || 0) === 0),
    surgicalThoughtsTotal: allSurgical.reduce((s, e) => s + (e.thoughtsTokens || 0), 0),
    surgicalCostUsd: allSurgical.reduce((s, e) => s + (e.costUsd || 0), 0),
    surgicalAvgCostUsd: allSurgical.length
      ? allSurgical.reduce((s, e) => s + (e.costUsd || 0), 0) / allSurgical.length
      : 0,
    preFixBaseline,
    savingsVsPreFix: allSurgical.length
      ? {
          costPct: Math.round((1 - (allSurgical.reduce((s, e) => s + e.costUsd, 0) / allSurgical.length) / preFixBaseline.avgCostUsd) * 1000) / 10,
          thoughtsEliminated: preFixBaseline.avgThoughts * allSurgical.length - allSurgical.reduce((s, e) => s + (e.thoughtsTokens || 0), 0),
        }
      : null,
  },
  costSummary: summarizeGenerationCost(allNew),
};

const outPath = path.join(ROOT, 'batches/ready/gate-logs/verify-opt-surgical-pipeline-2026-07-13.json');
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
