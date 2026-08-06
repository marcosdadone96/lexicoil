#!/usr/bin/env node
/**
 * Experimento generador: Flash (baseline retro) vs Gemini 2.5 Pro (misma factory/gates).
 *
 *   # Solo baseline Flash (14 OK pool-fill, sin API):
 *   node scripts/experiment-generator-quality.mjs --baseline-only
 *
 *   # Generar 10 partes con Pro + comparar:
 *   NODE_OPTIONS=--use-system-ca ALLOW_PRO_MODEL=1 node scripts/experiment-generator-quality.mjs --model gemini-2.5-pro
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { pushSessionMoldExclude } from './lib/poolFillSessionExclude.mjs';
import {
  analyzeBatch,
  analyzeBatchFile,
  findStructuralClones,
  summarizeDefectRates,
  estimateGeminiCostUsd,
} from './lib/analyzePartDefects.mjs';

loadEnvFile();
process.env.SEMANTIC_USE_GEMINI = process.env.SEMANTIC_USE_GEMINI || '1';

const FLASH_REPORT = path.join(ROOT, 'batches/generated/pool-fill-fresh-sample-report.json');

const PRO_PLAN = [
  { teil: 1, topic: 'Wohnen' },
  { teil: 1, topic: 'Bildung' },
  { teil: 2, topic: 'Bildung' },
  { teil: 2, topic: 'Wohnen' },
  { teil: 5, topic: 'Gesundheit' },
  { teil: 5, topic: 'Familie' },
  { teil: 4, topic: 'Familie' },
  { teil: 4, topic: 'Medien' },
  { teil: 1, topic: 'Arbeit' },
  { teil: 5, topic: 'Arbeit' },
];

function parseArgs(argv) {
  const out = { model: 'gemini-2.5-pro', baselineOnly: false, target: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') out.model = String(argv[++i] || 'gemini-2.5-pro').trim();
    else if (a === '--baseline-only') out.baselineOnly = true;
    else if (a === '--target') out.target = Math.max(1, Number(argv[++i]) || 10);
  }
  return out;
}

function analyzeFlashBaseline() {
  if (!fs.existsSync(FLASH_REPORT)) {
    console.warn('No hay pool-fill-fresh-sample-report.json — baseline Flash omitido.');
    return null;
  }
  const report = JSON.parse(fs.readFileSync(FLASH_REPORT, 'utf8'));
  const okRows = (report.attempts || []).filter((a) => a.ok && a.file);
  const analyses = [];
  for (const row of okRows) {
    const abs = path.join(ROOT, row.file);
    if (!fs.existsSync(abs)) continue;
    analyses.push(analyzeBatchFile(abs, { teil: row.teil, topic: row.topic, file: row.file }));
  }
  const clones = findStructuralClones(analyses);
  return {
    model: 'gemini-2.5-flash',
    source: 'pool-fill-fresh-sample (2026-07-06, sin exclude intra-sesión)',
    okParts: analyses.length,
    summary: summarizeDefectRates(analyses),
    structuralClones: clones,
    cloneGroups: clones.length,
    analyses,
  };
}

async function runProExperiment(model, target) {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    throw new Error('Falta GEMINI_API_KEY');
  }

  const plan = PRO_PLAN.slice(0, target);
  const { session, args: sessionArgs } = createLesenFactorySession({
    lang: 'de',
    level: 'B1',
    writeFile: true,
    model,
    allowProModel: true,
    maxApiCalls: Math.max(80, target * 10),
    fixRetries: 2,
    semantic: true,
    skipSem2: true,
  });
  sessionArgs.fromCoverage = true;
  sessionArgs.wordCount = 10;

  const runs = [];
  const analyses = [];
  const apiCallsStart = session.apiCallsUsed;

  console.log(`\n══ Experimento ${model} · ${plan.length} partes · exclude intra-sesión ON ══\n`);

  for (let i = 0; i < plan.length; i++) {
    const { teil, topic } = plan[i];
    sessionArgs.topic = topic;
    sessionArgs._resolvedTopic = topic;
    const callsBefore = session.apiCallsUsed;
    const usageBefore = { ...session.geminiUsage };

    console.log(`── ${i + 1}/${plan.length} · T${teil} · ${topic} ──`);

    const gen = await generateLesenPart({
      teil,
      topic,
      session: { session, args: sessionArgs },
      fixRetries: 2,
      writeFile: true,
    });

    const genCalls = session.apiCallsUsed - callsBefore;
    const partUsage = {
      promptTokens: session.geminiUsage.promptTokens - usageBefore.promptTokens,
      outputTokens: session.geminiUsage.outputTokens - usageBefore.outputTokens,
    };
    const partCost = estimateGeminiCostUsd(model, partUsage);

    const row = {
      n: i + 1,
      teil,
      topic,
      ok: gen.ok,
      file: gen.file,
      genCalls,
      attempts: gen.attempts,
      ms: gen.ms,
      costUsd: Number(partCost.toFixed(4)),
      tokens: partUsage,
    };

    if (gen.ok && gen.batch) {
      pushSessionMoldExclude(sessionArgs, gen.batch);
      const analysis = analyzeBatch(gen.batch, { teil, topic, file: gen.file });
      row.analysis = analysis;
      analyses.push(analysis);
      console.log(
        `  ✅ ${gen.file} · calls=${genCalls} · $${partCost.toFixed(3)} · defects caps=${analysis.defects.capsInOptions} key=${analysis.defects.keyExplanationMismatch} wm=${analysis.defects.wordMatching}`,
      );
    } else {
      console.log(`  ❌ ${gen.reason?.slice(0, 100) || 'fail'}`);
    }

    runs.push(row);
    if (session.stopped) break;
  }

  const totalCalls = session.apiCallsUsed - apiCallsStart;
  const totalCost = estimateGeminiCostUsd(model, session.geminiUsage);
  const clones = findStructuralClones(analyses);

  return {
    model,
    intraSessionExclude: true,
    plan: plan.length,
    ok: runs.filter((r) => r.ok).length,
    runs,
    summary: summarizeDefectRates(analyses),
    structuralClones: clones,
    cloneGroups: clones.length,
    apiCalls: totalCalls,
    tokens: session.geminiUsage,
    costUsdTotal: Number(totalCost.toFixed(4)),
    costUsdPerOkPart: runs.filter((r) => r.ok).length
      ? Number((totalCost / runs.filter((r) => r.ok).length).toFixed(4))
      : null,
  };
}

function printComparison(flash, pro) {
  console.log('\n══ Comparativa defectos por lote ══\n');
  console.log(
    `${'Métrica'.padEnd(28)} ${'Flash (14 OK)'.padStart(14)} ${'Pro (OK)'.padStart(14)}`,
  );
  console.log('-'.repeat(58));

  const rows = [
    ['Partes OK analizadas', flash?.okParts, pro?.ok],
    ['Mayúsculas/opción (total)', flash?.summary?.capsInOptions, pro?.summary?.capsInOptions],
    ['Mayúsculas/opción (por parte)', flash?.summary?.capsPerPart, pro?.summary?.capsPerPart],
    ['Clave↔explicación (total)', flash?.summary?.keyMismatch, pro?.summary?.keyMismatch],
    ['Clave↔explicación (por parte)', flash?.summary?.keyMismatchPerPart, pro?.summary?.keyMismatchPerPart],
    ['Word-matching (total)', flash?.summary?.wordMatching, pro?.summary?.wordMatching],
    ['Word-matching (por parte)', flash?.summary?.wordMatchingPerPart, pro?.summary?.wordMatchingPerPart],
    ['Grupos clone estructural', flash?.cloneGroups, pro?.cloneGroups],
  ];

  for (const [label, f, p] of rows) {
    console.log(`${String(label).padEnd(28)} ${String(f ?? '—').padStart(14)} ${String(p ?? '—').padStart(14)}`);
  }

  if (pro?.costUsdPerOkPart != null) {
    console.log(`\nCoste Pro: $${pro.costUsdTotal} total · $${pro.costUsdPerOkPart}/parte OK · ${pro.apiCalls} llamadas API`);
    console.log(`Tokens Pro: in=${pro.tokens.promptTokens} out=${pro.tokens.outputTokens}`);
  }

  console.log('\nNota Flash baseline: corrida SIN exclude intra-sesión (explica clones T4/T5).');
  console.log('Pro usa exclude intra-sesión — comparación de clones es conservadora a favor de Pro.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const flash = analyzeFlashBaseline();

  if (flash) {
    console.log('\n── Baseline Flash (retro-análisis 14 OK) ──');
    console.log(JSON.stringify({ okParts: flash.okParts, summary: flash.summary, cloneGroups: flash.cloneGroups }, null, 2));
  }

  let pro = null;
  if (!args.baselineOnly) {
    pro = await runProExperiment(args.model, args.target);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    flashBaseline: flash
      ? {
          model: flash.model,
          source: flash.source,
          okParts: flash.okParts,
          summary: flash.summary,
          structuralClones: flash.structuralClones,
          cloneGroups: flash.cloneGroups,
        }
      : null,
    experiment: pro,
    comparison: flash && pro
      ? {
          capsPerPart: { flash: flash.summary.capsPerPart, pro: pro.summary.capsPerPart },
          keyMismatchPerPart: { flash: flash.summary.keyMismatchPerPart, pro: pro.summary.keyMismatchPerPart },
          wordMatchingPerPart: { flash: flash.summary.wordMatchingPerPart, pro: pro.summary.wordMatchingPerPart },
          cloneGroups: { flash: flash.cloneGroups, pro: pro.cloneGroups },
          costUsdPerOkPart: pro.costUsdPerOkPart,
        }
      : null,
  };

  const out = path.join(ROOT, 'batches/generated/experiment-generator-quality-report.json');
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (flash && pro) printComparison(flash, pro);
  else if (flash) console.log(`\nInforme baseline: ${path.relative(ROOT, out)}`);
  else if (pro) console.log(`\nInforme experimento: ${path.relative(ROOT, out)}`);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
