#!/usr/bin/env node
/**
 * Generate a content batch via Gemini or Claude API, validate, optionally merge to bank.
 *
 * Setup:
 *   Gemini: GEMINI_API_KEY in .env
 *   Claude: ANTHROPIC_API_KEY in .env, CLAUDE_BUDGET_USD (default 2.30)
 *
 * Usage:
 *   node scripts/generate-batch-gemini.mjs --lang de --level B1 --provider claude
 *   node scripts/generate-batch-gemini.mjs --lang de --level B1 --module horen --teil 3 --merge
 *   node scripts/generate-batch-gemini.mjs --provider gemini --count 3 --merge
 *   node scripts/generate-batch-gemini.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import {
  buildBatchParams,
  buildMasterPrompt,
  LANG_META,
  loadPools,
} from './lib/batchParams.mjs';
import { DailyQuotaError } from './lib/geminiClient.mjs';
import {
  addUsage,
  assertWithinBudget,
  BudgetExceededError,
  spentUSD,
} from './lib/costMeter.mjs';
import { getProvider, providerLabel } from './lib/genProvider.mjs';
import { resolveMaxOutputTokens, isLikelyTruncated } from './lib/genOutputTokens.mjs';
import { extractJson } from './lib/extractJson.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import {
  buildConformanceRetryNote,
  gateBatchBeforeWrite,
} from './lib/generateConformanceGate.mjs';
import { rejectBatchFile, MERGED_DIR } from './lib/batchPaths.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

loadEnvFile();

const CHECKPOINT_FILE = path.join(ROOT, 'batches', '.generate-checkpoint.json');
const EXIT_DAILY_QUOTA = 2;

function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    module: null,
    teil: null,
    count: 1,
    merge: false,
    dryRun: false,
    skipValidate: false,
    retries: 1,
    conformanceRetries: 2,
    provider: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i]?.toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--module') out.module = argv[++i];
    else if (a === '--teil') out.teil = argv[++i];
    else if (a === '--count') out.count = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--merge') out.merge = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--no-validate') out.skipValidate = true;
    else if (a === '--retries') out.retries = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--conformance-retries') out.conformanceRetries = Math.max(0, Number(argv[++i]) || 2);
    else if (a === '--provider') out.provider = argv[++i]?.toLowerCase();
  }
  if (!out.provider) out.provider = providerLabel();
  return out;
}

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function validateBatch(lang, level, file) {
  run(`node scripts/validate-batch.mjs --lang ${lang} --level ${level} --file "${file}"`);
}

function mergeBatch(lang, level, file) {
  run(`node scripts/merge-bank-batch.mjs --lang ${lang} --level ${level} --file "${file}"`);
  run(`node scripts/sync-passages-mirror.mjs --lang ${lang} --level ${level}`);
}

function budgetUSD() {
  return Number(process.env.CLAUDE_BUDGET_USD || 2.3);
}

function loadBlueprint(lang, level) {
  const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
  const id = ExamBlueprint.INDEX[`${lang}_${level}`];
  if (!id) throw new Error(`No blueprint for ${lang}/${level}`);
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints', `${id}.json`), 'utf8'));
}

function writeBudgetCheckpoint(args, params) {
  fs.mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
  fs.writeFileSync(
    CHECKPOINT_FILE,
    `${JSON.stringify(
      {
        reason: 'budget_exceeded',
        provider: args.provider,
        lang: args.lang,
        level: args.level,
        pendingJob: {
          module: params?.module ?? args.module,
          teil: params?.teil ?? args.teil,
        },
        spentUSD: spentUSD(),
        budgetUSD: budgetUSD(),
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function logUsage(provider, model, usage, maxTokens) {
  if (!usage) return;
  if (provider === 'claude') {
    console.log(
      `Tokens: in=${usage.input_tokens ?? '?'} out=${usage.output_tokens ?? '?'} (max_out=${maxTokens ?? '?'})` +
        (usage.cache_read_input_tokens ? ` cache_read=${usage.cache_read_input_tokens}` : ''),
    );
  } else {
    console.log(`Tokens: in=${usage.promptTokenCount ?? '?'} out=${usage.candidatesTokenCount ?? '?'} (max_out=${maxTokens ?? '?'})`);
  }
  console.log(`Modelo: ${model}`);
}

async function callProvider(client, provider, prompt, module, teil) {
  const maxTokens = resolveMaxOutputTokens(provider, module, teil);
  console.log(`max_output_tokens=${maxTokens}`);
  const result = await client.generateContent({ prompt, maxTokens });
  if (
    isLikelyTruncated(provider, result.usage, maxTokens, result.stopReason) &&
    maxTokens < 16384
  ) {
    const bumped = Math.min(16384, maxTokens * 2);
    console.warn(`⚠ Respuesta truncada (out≈${maxTokens}) — reintento con max_output_tokens=${bumped}…`);
    const retry = await client.generateContent({ prompt, maxTokens: bumped });
    return { ...retry, _retried: true, _firstUsage: result.usage, _firstMaxTokens: maxTokens };
  }
  return result;
}

async function generateOne(args, pools, client) {
  const params = buildBatchParams(pools, args.lang, {
    level: args.level,
    module: args.module,
    teil: args.teil,
  });
  const basePrompt = buildMasterPrompt(args.lang, params);
  const blueprint = loadBlueprint(args.lang, params.level);
  const outFile = path.join(MERGED_DIR, params.outputFile);
  const relFile = path.relative(ROOT, outFile).replace(/\\/g, '/');
  const provider = args.provider;

  console.log(`\n── ${params.module} T${params.teil} · ${params.slug} ──`);
  console.log(`Tema: ${params.topic}`);
  console.log(`Proveedor: ${provider}`);
  console.log(`max_output_tokens=${resolveMaxOutputTokens(provider, params.module, params.teil)}`);
  console.log(`Archivo: ${relFile}`);

  if (args.dryRun) {
    console.log('\n[dry-run] Prompt (primeras 800 chars):\n');
    console.log(basePrompt.slice(0, 800) + '…\n');
    return { ok: true, dryRun: true, params, outFile: relFile };
  }

  let lastErr;
  let workPrompt = basePrompt;

  for (let cAttempt = 0; cAttempt <= args.conformanceRetries; cAttempt++) {
    if (cAttempt > 0) {
      console.log(`\nReintento conformidad ${cAttempt}/${args.conformanceRetries}…`);
    }

    for (let attempt = 1; attempt <= args.retries; attempt++) {
      try {
        if (attempt > 1) console.log(`\nReintento API ${attempt}/${args.retries}…`);
        if (provider === 'claude') assertWithinBudget();
        console.log(`Llamando ${provider}…`);
        const gen = await callProvider(client, provider, workPrompt, params.module, params.teil);
        const { text, model, usage, maxTokens, stopReason } = gen;
        if (provider === 'claude') {
          if (gen._firstUsage) addUsage(model, gen._firstUsage);
          if (usage) addUsage(model, usage);
          console.log(
            `Gasto acumulado: $${spentUSD().toFixed(4)} / budget $${budgetUSD().toFixed(2)}`,
          );
        }
        logUsage(provider, model, usage, maxTokens ?? gen._firstMaxTokens);
        if (isLikelyTruncated(provider, usage, maxTokens, stopReason)) {
          throw new Error(
            `JSON truncado — agotó max_output_tokens (${maxTokens}). ` +
              'Lesen T2/T3 necesitan ~16k; revisa genOutputTokens.mjs o GEN_MAX_OUTPUT_TOKENS.',
          );
        }

        const batch = normalizeBatch(extractJson(text));
        if (!batch || typeof batch !== 'object') throw new Error('JSON raíz inválido');
        if (!Array.isArray(batch.questions)) throw new Error('Falta array questions');

        const conformance = gateBatchBeforeWrite(batch, blueprint);
        if (!conformance.ok) {
          for (const item of conformance.items.filter((i) => !i.ok)) {
            console.error(`${item.id}: ${item.reasons.join('; ')}`);
          }
          if (cAttempt < args.conformanceRetries) {
            workPrompt = basePrompt + buildConformanceRetryNote(conformance.items);
            lastErr = new Error('Batch no conforme con blueprint');
            break;
          }
          throw new Error(
            `Batch no conforme tras ${args.conformanceRetries} reintentos de conformidad`,
          );
        }

        fs.mkdirSync(MERGED_DIR, { recursive: true });
        fs.writeFileSync(outFile, JSON.stringify(batch, null, 2) + '\n', 'utf8');
        console.log(`Guardado: ${relFile} (${batch.questions.length} preguntas, ${(batch.passages || []).length} passages)`);

        if (!args.skipValidate) {
          console.log('Validando…');
          validateBatch(args.lang, params.level, relFile);
          console.log('Validación OK');
        }

        if (args.merge) {
          console.log('Merge al banco…');
          mergeBatch(args.lang, params.level, relFile);
          console.log('Merge OK');
        } else {
          console.log(`Siguiente: node scripts/merge-bank-batch.mjs --lang ${args.lang} --level ${params.level} --file ${relFile}`);
        }

        return { ok: true, params, outFile: relFile };
      } catch (err) {
        if (err instanceof BudgetExceededError || err?.name === 'BudgetExceededError') {
          writeBudgetCheckpoint(args, params);
          console.error(`\nTope de gasto alcanzado ($${budgetUSD().toFixed(2)}). Sube CLAUDE_BUDGET_USD para continuar.`);
          process.exit(0);
        }
        if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') {
          console.error(`\n${err.message}`);
          process.exit(EXIT_DAILY_QUOTA);
        }
        lastErr = err;
        console.error(`Error: ${err.message}`);
        if (fs.existsSync(outFile)) {
          const moved = rejectBatchFile(outFile);
          if (moved) console.error(`Descartado → ${moved}`);
        }
        if (err.message.includes('no conforme tras')) {
          return { ok: false, error: err.message, params };
        }
      }
    }

    if (lastErr?.message === 'Batch no conforme con blueprint') continue;
    break;
  }

  return { ok: false, error: lastErr?.message, params };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const meta = LANG_META[args.lang];
  if (!meta) {
    console.error(`Idioma no soportado: ${args.lang}`);
    process.exit(1);
  }

  if (!args.dryRun) {
    if (args.provider === 'gemini' && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      console.error('Falta GEMINI_API_KEY en .env');
      console.error('Obtén una en: https://aistudio.google.com/apikey');
      process.exit(1);
    }
    if (args.provider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
      console.error('Falta ANTHROPIC_API_KEY en .env');
      console.error('Obtén una en: https://console.anthropic.com/');
      process.exit(1);
    }
  }

  const client = await getProvider(args.provider);
  const pools = loadPools(args.lang);
  console.log(`\nBatch generator (${args.provider}) — ${args.lang}/${args.level} × ${args.count}`);
  console.log(`Prompt: ${meta.masterPrompt}`);
  if (args.provider === 'claude') {
    console.log(`Presupuesto Claude: $${budgetUSD().toFixed(2)} (gastado: $${spentUSD().toFixed(4)})`);
  }
  if (args.merge) console.log('Modo: generar + validar + merge');

  const results = [];
  for (let i = 0; i < args.count; i++) {
    if (args.count > 1) console.log(`\n======== Batch ${i + 1}/${args.count} ========`);
    results.push(await generateOne(args, pools, client));
    if (i < args.count - 1 && !args.dryRun) {
      const pause = Number(process.env.GEMINI_BATCH_PAUSE_MS || 5000);
      console.log(`\nPausa ${pause / 1000}s antes del siguiente batch…`);
      await new Promise((r) => setTimeout(r, pause));
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  console.log(`\nResumen: ${ok} OK, ${fail} fallidos`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  if (err instanceof BudgetExceededError || err?.name === 'BudgetExceededError') {
    console.error(`\n${err.message}`);
    process.exit(0);
  }
  if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') {
    console.error(`\n${err.message}`);
    process.exit(EXIT_DAILY_QUOTA);
  }
  console.error(err.message || err);
  process.exit(1);
});
