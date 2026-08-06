#!/usr/bin/env node
/**
 * Verificación PASO 1: SEM-1 en factory (generación), SEM-2 omitido, T3 incluido.
 *
 *   node scripts/verify-sem1-factory-gen.mjs
 *   node scripts/verify-sem1-factory-gen.mjs --count 2
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { _setLlmFn as setSem1LlmFn } from './lib/semanticValidator.mjs';
import { _setHolisticJudgeLlmFn } from './lib/holisticJudge.mjs';

loadEnvFile();
process.env.SEMANTIC_USE_GEMINI = process.env.SEMANTIC_USE_GEMINI || '1';

const perTeil = Math.max(1, Number(process.argv.find((a, i) => process.argv[i - 1] === '--count') || 2));
const TEILE = [1, 2, 3];

async function main() {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error('Falta GEMINI_API_KEY — abortando verificación live.');
    process.exit(1);
  }

  let sem1Calls = 0;
  let sem2Calls = 0;

  setSem1LlmFn(async (prompt) => {
    sem1Calls += 1;
    const { generateContent } = await import('./lib/geminiClient.mjs');
    return generateContent({ prompt, jsonMode: true, maxRetries: 2, maxTokens: 1024, temperature: 0.1 });
  });

  _setHolisticJudgeLlmFn(async (prompt) => {
    sem2Calls += 1;
    const { generateContent } = await import('./lib/geminiClient.mjs');
    return generateContent({ prompt, jsonMode: true, maxRetries: 2, maxTokens: 512, temperature: 0.1 });
  });

  const { session, args: sessionArgs } = createLesenFactorySession({
    lang: 'de',
    level: 'B1',
    writeFile: false,
    maxApiCalls: 80,
    fixRetries: 2,
  });

  console.log('\n══ Verificación SEM-1 factory (PASO 1) ══');
  console.log(`Factory semantic=${sessionArgs.semantic} skipSem2=${sessionArgs.skipSem2}`);
  console.log(`Plan: ${perTeil}× T1,T2,T3 = ${perTeil * 3} partes\n`);

  sessionArgs.fromCoverage = true;
  sessionArgs.wordCount = 8;
  sessionArgs.topic = 'Technik';
  sessionArgs._resolvedTopic = 'Technik';

  const results = [];
  let genLlmCalls = 0;

  for (const teil of TEILE) {
    for (let i = 0; i < perTeil; i++) {
      const apiBefore = session.apiCallsUsed;
      const sem1Before = sem1Calls;
      const t0 = Date.now();

      const gen = await generateLesenPart({
        teil,
        topic: 'Technik',
        session: { session, args: sessionArgs },
        fixRetries: 2,
        writeFile: false,
      });

      const genCalls = session.apiCallsUsed - apiBefore;
      const sem1Delta = sem1Calls - sem1Before;
      genLlmCalls += genCalls;

      const issueLines = gen.issues || [];
      const semKeyIssues = issueLines.filter((i) => /SEM-(CORRECTNESS|AMBIGUITY)/i.test(String(i)));
      const anySem = issueLines.filter((i) => /SEM-/i.test(String(i)));

      results.push({
        teil,
        ok: gen.ok,
        reason: gen.reason,
        gate: gen.gate,
        attempts: gen.attempts,
        genCalls,
        sem1Calls: sem1Delta,
        semKeyIssues: semKeyIssues.length,
        semIssueSample: semKeyIssues[0] || null,
        ms: Date.now() - t0,
      });

      const flag = gen.ok ? '✅' : '❌';
      console.log(
        `${flag} T${teil} #${i + 1} · genLLM=${genCalls} sem1=${sem1Delta} attempts=${gen.attempts ?? '?'} · ${gen.ok ? 'OK' : gen.reason || gen.gate}`,
      );
      if (semKeyIssues.length) {
        console.log(`   SEM clave/ambig en generación: ${semKeyIssues[0]?.slice(0, 100)}`);
      } else if (anySem.length) {
        console.log(`   SEM otros (distractor/template): ${anySem.length}`);
      }
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const semBlocked = results.filter((r) => r.semKeyIssues > 0).length;
  const totalSem1 = results.reduce((s, r) => s + r.sem1Calls, 0);
  const avgSem1PerPart = results.length ? (totalSem1 / results.length).toFixed(2) : 0;
  const avgGenPerPart = results.length ? (genLlmCalls / results.length).toFixed(2) : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    factory: { semantic: sessionArgs.semantic, skipSem2: sessionArgs.skipSem2 },
    parts: results.length,
    ok,
    semKeyBlockedDuringGen: semBlocked,
    sem1CallsTotal: totalSem1,
    sem2LlmCalls: sem2Calls,
    genLlmCallsTotal: genLlmCalls,
    avgSem1PerPart: Number(avgSem1PerPart),
    avgGenPerPart: Number(avgGenPerPart),
    results,
  };

  const outPath = path.join(ROOT, 'batches/generated/verify-sem1-factory-gen-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n── Resumen ──');
  console.log(`Partes OK: ${ok}/${results.length}`);
  console.log(`Bloqueadas por SEM clave/ambigüedad DURANTE generación: ${semBlocked}`);
  console.log(`LLM generación: ${genLlmCalls} total (media ${avgGenPerPart}/parte)`);
  console.log(`LLM SEM-1: ${totalSem1} total (media ${avgSem1PerPart}/parte — esperado ~1 si pasa POOL-2)`);
  console.log(`LLM SEM-2 en generación: ${sem2Calls} (esperado 0)`);
  console.log(`Informe: ${path.relative(ROOT, outPath)}`);

  if (sem2Calls > 0) {
    console.error('\n❌ SEM-2 corrió durante generación.');
    process.exit(1);
  }
  if (sessionArgs.semantic !== true || sessionArgs.skipSem2 !== true) {
    console.error('\n❌ Factory defaults incorrectos.');
    process.exit(1);
  }

  console.log('\n✅ PASO 1 wiring OK.');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
