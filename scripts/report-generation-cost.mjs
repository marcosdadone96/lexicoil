#!/usr/bin/env node
/**
 * Report Gemini generation costs from batches/ready/gate-logs/generation-cost.jsonl
 *
 *   node scripts/report-generation-cost.mjs
 *   node scripts/report-generation-cost.mjs --json
 *   node scripts/report-generation-cost.mjs --since 2026-07-11
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATION_COST_LOG,
  readGenerationCostLog,
  summarizeGenerationCost,
  GEMINI_PRICE_INPUT_PER_M,
  GEMINI_PRICE_OUTPUT_PER_M,
} from './lib/generationCostLog.mjs';

function parseArgs(argv) {
  const out = { log: GENERATION_COST_LOG, json: false, since: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--log') out.log = path.resolve(String(argv[++i]));
    else if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--since') out.since = String(argv[++i]);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let entries = readGenerationCostLog(args.log);
  if (args.since) {
    const since = Date.parse(args.since);
    if (Number.isFinite(since)) {
      entries = entries.filter((e) => Date.parse(e.ts || e.flushedAt || 0) >= since);
    }
  }
  const summary = summarizeGenerationCost(entries);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          log: path.relative(process.cwd(), args.log).replace(/\\/g, '/'),
          prices: {
            inputUsdPer1M: GEMINI_PRICE_INPUT_PER_M,
            outputUsdPer1M: GEMINI_PRICE_OUTPUT_PER_M,
            note: 'output billed = candidatesTokens + thoughtsTokens',
          },
          summary,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Log: ${path.relative(process.cwd(), args.log).replace(/\\/g, '/')}`);
  console.log(
    `Precios: input $${GEMINI_PRICE_INPUT_PER_M}/1M · output $${GEMINI_PRICE_OUTPUT_PER_M}/1M (candidates+thoughts)`,
  );
  console.log(`Llamadas: ${summary.calls} · ok ${summary.okCalls} · fail ${summary.failCalls} · éxito ${(summary.successRate * 100).toFixed(1)}%`);
  console.log(
    `Costo total: $${summary.totalCostUsd.toFixed(6)} · ok $${summary.okCostUsd.toFixed(6)} · fail $${summary.failCostUsd.toFixed(6)}`,
  );
  console.log(
    `Tokens: prompt=${summary.promptTokens} candidates=${summary.candidatesTokens} thoughts=${summary.thoughtsTokens}`,
  );
  console.log('\nPor módulo/teil:');
  for (const [k, v] of Object.entries(summary.byModuleTeil).sort()) {
    console.log(
      `  ${k}: calls=${v.calls} ok=${v.ok} fail=${v.fail} cost=$${v.costUsd.toFixed(6)}`,
    );
  }
  if (summary.files.length) {
    console.log('\nPor archivo:');
    for (const f of summary.files) {
      console.log(`  ${f.ok ? 'OK  ' : 'FAIL'} ${f.file} · $${f.costUsd.toFixed(6)} (${f.calls} calls)`);
    }
  }
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main();
