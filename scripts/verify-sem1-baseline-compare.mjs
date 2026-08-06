#!/usr/bin/env node
/**
 * Análisis ampliado: todos los batches lesen POOL-2-clean × SEM-1 (métricas paso 1).
 *   NODE_OPTIONS=--use-system-ca node scripts/verify-sem1-baseline-compare.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { validatePart } from './lib/partGate.mjs';
import { _setLlmFn as setSem1, clearSemanticCache } from './lib/semanticValidator.mjs';
import { _setHolisticJudgeLlmFn } from './lib/holisticJudge.mjs';

loadEnvFile();
process.env.SEMANTIC_USE_GEMINI = process.env.SEMANTIC_USE_GEMINI || '1';

let sem1Calls = 0;
let sem2Calls = 0;
setSem1(async (prompt) => {
  sem1Calls += 1;
  const { generateContent } = await import('./lib/geminiClient.mjs');
  return generateContent({ prompt, jsonMode: true, maxRetries: 2, maxTokens: 1024, temperature: 0.1 });
});
_setHolisticJudgeLlmFn(async () => {
  sem2Calls += 1;
  return JSON.stringify({ themeTags: [], findings: [] });
});

const dir = path.join(ROOT, 'batches/generated');
const files = fs
  .readdirSync(dir)
  .filter((f) => /^lesen-t[1-5]-gemini-\d+\.json$/i.test(f))
  .sort();

const pool2Clean = [];
const semBlocked = [];
let correctnessParts = 0;
let ambiguityParts = 0;
let correctnessItems = 0;
let ambiguityItems = 0;
let distractorOrOther = 0;

for (const f of files) {
  clearSemanticCache();
  const batch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const teil = Number(f.match(/lesen-t(\d)/i)[1]);
  const sem1Before = sem1Calls;

  const struct = await validatePart(batch, {
    module: 'lesen',
    teil,
    semantic: false,
    skipSem2: true,
    skipDedup: true,
  });
  if (!struct.ok) continue;

  pool2Clean.push(f);
  const sem1ForPart = sem1Calls - sem1Before;

  const full = await validatePart(struct.batch, {
    module: 'lesen',
    teil,
    semantic: true,
    skipSem2: true,
    skipDedup: true,
    skipNormalize: true,
  });

  const blocking = full.blocking || [];
  const corr = blocking.filter((x) => x.id === 'SEM-CORRECTNESS');
  const amb = blocking.filter((x) => x.id === 'SEM-AMBIGUITY');
  const keyBlock = corr.length + amb.length > 0;

  if (keyBlock) {
    semBlocked.push({ f, teil, corr: corr.length, amb: amb.length, sem1Calls: sem1ForPart + (sem1Calls - sem1Before - sem1ForPart) });
    if (corr.length) correctnessParts += 1;
    if (amb.length) ambiguityParts += 1;
    correctnessItems += corr.length;
    ambiguityItems += amb.length;
  } else if (!full.ok) {
    distractorOrOther += 1;
  }
}

const n = pool2Clean.length;
const blocked = semBlocked.length;
const pct = n ? ((blocked / n) * 100).toFixed(1) : '0';

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'all batches/generated lesen-t*-gemini-*.json',
  pool2Clean: n,
  semKeyBlocked: blocked,
  semKeyBlockedPct: Number(pct),
  baselineExpectedPct: 29,
  breakdown: {
    partsWithCorrectness: correctnessParts,
    partsWithAmbiguity: ambiguityParts,
    correctnessFindings: correctnessItems,
    ambiguityFindings: ambiguityItems,
    otherSemFail: distractorOrOther,
  },
  sem1CallsTotal: sem1Calls,
  sem1CallsPerPool2Clean: n ? Number((sem1Calls / n).toFixed(2)) : 0,
  sem2CallsTotal: sem2Calls,
  semBlockedSamples: semBlocked.slice(0, 8).map(({ f, teil, corr, amb }) => ({ f, teil, corr, amb })),
};

const out = path.join(dir, 'verify-sem1-baseline-compare-report.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
