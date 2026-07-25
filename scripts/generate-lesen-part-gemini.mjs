#!/usr/bin/env node
/**
 * Genera partes de Lesen B1 con Gemini (Flash/Flash-Lite) o T3 sin API (make-t3).
 * Guarda en batches/generated/ tras pasar formato (validate-batch) + calidad (checkLesenBatchQuality).
 *
 * Proveedores:
 *   --provider gemini  → tier gratuito (--pause-ms 6000, --max-api-calls)
 *   T3 → scripts/make-t3.mjs (0 llamadas)
 *
 * Uso:
 *   node scripts/generate-lesen-part-gemini.mjs --teil 1 --from-coverage
 *   node scripts/generate-lesen-part-gemini.mjs --all-teile --count 2 --from-coverage
 *   node scripts/factory-lesen.mjs --count 3
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateContent as generateGemini, DailyQuotaError } from './lib/geminiClient.mjs';
import { extractJson } from './lib/extractJson.mjs';
import { resolveMaxOutputTokens, isLikelyTruncated } from './lib/genOutputTokens.mjs';
import {
  buildLesenPrompt,
  buildT1QuestionsRepairPrompt,
  loadWeakLemmas,
  nextOutputBasename,
  pickRandomWords,
  pickTargetWords,
} from './lib/lesenTemplatePrompt.mjs';
import {
  checkLesenBatchQuality,
  formatQualityReport,
  tokenize,
} from './lib/lesenBatchQuality.mjs';
import { checkLesenBatchIngest, formatIngestReport, logCefrCoverageThreshold } from './lib/lesenBatchIngestCheck.mjs';
import { coerceGeneratedLesenPart } from './lib/normalizeBatch.mjs';
import { checkLexical, formatLexicalReport } from './lib/lexicalCheck.mjs';
import { validatePart, buildDedupCorpusFromDir } from './lib/partGate.mjs';
import { pickNextTopic, injectTopicIntoPrompt, tagBatchWithTopic } from './lib/topicRotation.mjs';
import { classifyAndRepair } from './lib/repairTriage.mjs';
import { resolveGenerationVocab, resolveTargetWordsForArgs } from './lib/resolveGenerationInput.mjs';
import { attachVocabFeedback, formatVocabFeedbackSummary } from './lib/generationFeedback.mjs';
import { buildValidatedT3Part } from './make-t3.mjs';

loadEnvFile();

const GENERATED_DIR = path.join(ROOT, 'batches', 'generated');
const EXIT_DAILY_QUOTA = 2;
const EXIT_RATE_LIMIT = 3;
const EXIT_API_BUDGET = 4;
const MIN_PAUSE_MS = 6000;
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_WORD_COUNT = 5;
const RATE_LIMIT_WAIT_MS = 60_000;

function usesApiBudget(provider) {
  return provider === 'gemini';
}

export class ApiBudgetStopError extends Error {
  constructor() {
    super('Presupuesto --max-api-calls alcanzado');
    this.name = 'ApiBudgetStopError';
  }
}

export class RateLimitStopError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitStopError';
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function is429Error(err) {
  return /429|rate limit|Resource exhausted|Quota exceeded/i.test(String(err?.message || err));
}

function isProModel(model) {
  const m = String(model || '').toLowerCase();
  return /(?:^|[-_/])pro(?:$|[-_/])/.test(m) || m.includes('gemini-pro');
}

export function resolveLesenModel(modelArg) {
  const model = (modelArg || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  if (isProModel(model)) {
    throw new Error(
      `Modelo Pro no permitido en tier gratuito (${model}). ` +
        'Usa --model gemini-2.5-flash o gemini-2.5-flash-lite.',
    );
  }
  return model;
}

export function resolveProviderModel(provider, modelArg) {
  return resolveLesenModel(modelArg);
}

export async function resolveLesenProvider(providerArg) {
  if (providerArg) {
    const p = String(providerArg).toLowerCase();
    if (p !== 'gemini') {
      throw new Error('--provider debe ser gemini');
    }
    return p;
  }
  return 'gemini';
}

export function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    teil: null,
    teileList: null,
    allTeile: false,
    count: 1,
    words: null,
    fromCoverage: false,
    fromBank: false,
    wordCount: DEFAULT_WORD_COUNT,
    refreshCoverage: false,
    dryRun: false,
    skipValidate: false,
    skipQuality: false,
    skipIngest: false,
    apiRetries: 1,
    fixRetries: null,
    pauseMs: Math.max(MIN_PAUSE_MS, Number(process.env.GEMINI_BATCH_PAUSE_MS || MIN_PAUSE_MS)),
    model: null,
    provider: null,
    maxApiCalls: 200,
    keepFailed: false,
    topic: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--teil') out.teil = Number(argv[++i]);
    else if (a === '--teile') {
      out.teileList = String(argv[++i] || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
    } else if (a === '--all-teile') out.allTeile = true;
    else if (a === '--count') out.count = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--words') {
      out.words = String(argv[++i] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === '--from-coverage') out.fromCoverage = true;
    else if (a === '--from-bank') out.fromBank = true;
    else if (a === '--word-count') out.wordCount = Math.max(1, Number(argv[++i]) || DEFAULT_WORD_COUNT);
    else if (a === '--refresh-coverage') out.refreshCoverage = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--no-validate') out.skipValidate = true;
    else if (a === '--skip-quality') out.skipQuality = true;
    else if (a === '--skip-ingest') out.skipIngest = true;
    else if (a === '--api-retries') out.apiRetries = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--fix-retries') out.fixRetries = Math.max(0, Number(argv[++i]) || 0);
    else if (a === '--provider') out.provider = String(argv[++i] || '').toLowerCase();
    else if (a === '--pause-ms') out.pauseMs = Math.max(MIN_PAUSE_MS, Number(argv[++i]) || MIN_PAUSE_MS);
    else if (a === '--model') out.model = String(argv[++i] || '').trim();
    else if (a === '--max-api-calls') out.maxApiCalls = Math.max(1, Number(argv[++i]) || 200);
    else if (a === '--keep-failed') out.keepFailed = true;
    else if (a === '--topic') out.topic = String(argv[++i] || '').trim();
  }
  out.pauseMs = Math.max(MIN_PAUSE_MS, out.pauseMs);
  return out;
}

function createSession(args) {
  const byTeil = {};
  for (const t of [1, 2, 3, 4, 5]) {
    byTeil[t] = { generated: 0, discarded: 0, attempts: 0 };
  }
  return {
    provider: args.provider,
    model: resolveProviderModel(args.provider, args.model),
    maxApiCalls: args.maxApiCalls,
    minPauseMs: args.pauseMs,
    apiCallsUsed: 0,
    totalAttempts: 0,
    lastApiCallAt: 0,
    stopped: false,
    stopReason: null,
    byTeil,
  };
}

function teileToRun(args) {
  if (args.teileList?.length) return [...new Set(args.teileList)].sort((a, b) => a - b);
  if (args.allTeile) return [1, 2, 3, 4, 5];
  if (!Number.isFinite(args.teil) || args.teil < 1 || args.teil > 5) {
    throw new Error('Indica --teil 1..5, --teile 1,2,5 o --all-teile');
  }
  return [args.teil];
}

function refreshCoverageReport(lang, level) {
  console.log('Actualizando reporte de cobertura…');
  execSync(`node scripts/vocab-coverage-report.mjs --lang ${lang} --level ${level}`, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function resolveTargetWords(args) {
  return resolveTargetWordsForArgs(args, { module: 'lesen', teil: args.teil ?? 1 });
}

function validateBatchFile(lang, level, relFile) {
  const res = spawnSync(
    process.execPath,
    ['scripts/validate-batch.mjs', '--lang', lang, '--level', level, '--file', relFile],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const output = `${res.stdout || ''}${res.stderr || ''}`.trim();
  return { ok: res.status === 0, output };
}

function buildFixNote(issues, gate = 'checker') {
  const list = (Array.isArray(issues) ? issues : [issues]).filter(Boolean).slice(0, 5);
  let extra = '';
  if (list.some((i) => /slot_not_in_blueprint/i.test(String(i)))) {
    extra =
      '\nCada pregunta y pasaje DEBE incluir `"module":"lesen"` y `"teil":N (número).';
  }
  if (list.some((i) => /type_not_allowed/i.test(String(i)))) {
    extra +=
      '\nT1→type "richtig_falsch" · T2/T5→"multiple_choice" con options a/b/c · T4→"ja_nein".';
  }
  if (list.some((i) => /palabras idénticas|copia literal|word-matching/i.test(String(i)))) {
    extra +=
      '\nANTI WORD-MATCHING: reescribe cada afirmación/pregunta SIN repetir palabras del pasaje ' +
      '(máx. 2 palabras de contenido iguales). Usa sinónimos.';
  }
  // Scope-trap hint eliminado: CHK-10 del auditor gestiona la correlación; no forzamos
  // ningún requisito de absolute-word aquí para evitar el patrón "absoluta→Falsch".
  return (
    `\n\n--- CORRECCIÓN REQUERIDA ---\n` +
    `El checker de ${gate} detectó:\n${list.map((i) => `- ${i}`).join('\n')}${extra}\n` +
    `Corrige SOLO esos problemas. Devuelve el JSON completo corregido, sin markdown ni comentarios.`
  );
}

function passageForbiddenTokens(text, limit = 25) {
  const freq = new Map();
  for (const t of tokenize(text)) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

function saveRejectedBatch(batch, basename, reason) {
  const dir = path.join(GENERATED_DIR, '.rejected');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${basename.replace(/\.json$/i, '')}-${stamp}.json`);
  fs.writeFileSync(
    file,
    `${JSON.stringify({ _rejectedReason: reason, ...batch }, null, 2)}\n`,
    'utf8',
  );
  console.log(`Rechazado guardado en: ${path.relative(ROOT, file).replace(/\\/g, '/')}`);
}

function buildLesenPromptBundle(teil, words, session) {
  const idSuffix = randomBytes(4).toString('hex');
  const fullPrompt = buildLesenPrompt(teil, words, { idSuffix });
  return { idSuffix, fullPrompt, systemPrompt: null, userPrompt: fullPrompt };
}

async function tryRepairT1Questions(session, args, batch, teil, qualityIssues, maxTokens) {
  if (Number(teil) !== 1 || !batch?.passages?.[0]?.text) return null;

  const passage = batch.passages[0];
  const idSuffix = randomBytes(4).toString('hex');
  const repairPrompt = buildT1QuestionsRepairPrompt({
    passage,
    idSuffix,
    forbiddenTokens: passageForbiddenTokens(passage.text),
    qualityIssues,
  });

  console.log('T1: reparando solo afirmaciones (pasaje fijo)…');
  const result = await callLlm(session, args, {
    prompt: repairPrompt,
    maxTokens: Math.min(maxTokens, 4096),
  });

  let parsed;
  try {
    parsed = extractJson(result.text);
  } catch (_) {
    return null;
  }

  const newQuestions = Array.isArray(parsed?.questions) ? parsed.questions : null;
  if (!newQuestions?.length) return null;

  return coerceGeneratedLesenPart(
    { passages: batch.passages, questions: newQuestions },
    { module: 'lesen', teil: 1, lang: args.lang, level: args.level },
  );
}

function validationIssues(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('==') && !l.startsWith('Preguntas:') && !l.startsWith('Esquema:'));
}

function firstValidationIssue(output) {
  const line = String(output || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  return line || 'Validación técnica fallida';
}

async function runQualityAndStructuralGates(args, teil, batch, { onFail } = {}) {
  if (!args.skipQuality) {
    const quality = checkLesenBatchQuality(batch, teil);
    if (!args.inMemory) console.log(formatQualityReport(quality));
    if (!quality.ok) {
      onFail?.();
      return {
        ok: false,
        gate: 'calidad',
        issue: quality.issues?.[0] || 'Calidad pedagógica FAIL',
        issues: (quality.issues || []).slice(0, 5),
        detail: formatQualityReport(quality),
      };
    }
  }

  if (!args.skipQuality) {
    const lex = checkLexical(batch);
    if (!lex.ok) {
      if (!args.inMemory) console.log(formatLexicalReport(lex));
      onFail?.();
      return {
        ok: false,
        gate: 'lexico',
        issue: lex.issues[0] || 'Error léxico',
        issues: lex.issues.slice(0, 5),
        detail: formatLexicalReport(lex),
      };
    }
    if (!args.inMemory && lex.warnings?.length) console.log(formatLexicalReport(lex));
  }

  if (!args.skipQuality) {
    let dedupCorpus = args.dedupCorpus ?? null;
    if (!args.skipDedup && !dedupCorpus) {
      try {
        const currentIds = new Set((batch.passages || []).map((p) => p.id).filter(Boolean));
        dedupCorpus = buildDedupCorpusFromDir(GENERATED_DIR, fs, path)
          .filter((e) => !currentIds.has(e.id));
      } catch (e) {
        if (!args.inMemory) console.warn(`  ⚠ dedup corpus omitido: ${e.message}`);
      }
    }

    const gate = await validatePart(batch, {
      semantic: false,
      skipNormalize: true,
      skipDedup: args.skipDedup || !dedupCorpus?.length,
      dedupCorpus,
      dedupThreshold: args.dedupThreshold ?? 0.55,
      module: 'lesen',
      teil,
      lang: args.lang,
      level: args.level,
    });

    if (!args.inMemory && gate.dedup?.warnings?.length) {
      for (const w of gate.dedup.warnings) console.log(`  ⚠ dedup: ${w}`);
    }

    if (!gate.ok) {
      const first = gate.blocking[0];
      const isDedup = first?.id === 'DEDUP';
      const issue = first?.message || (isDedup ? 'Deduplicación FAIL' : 'audit-pass-2 IMPORTANT');
      if (!args.inMemory) {
        if (isDedup) console.log(`Deduplicación FAIL: ${issue}`);
        else console.log(`Audit-pass-2 BLOQUEADO: [${first?.severity}][${first?.id}] ${issue}`);
      }
      onFail?.();
      return {
        ok: false,
        gate: isDedup ? 'dedup' : 'audit2',
        issue,
        issues: gate.blocking.slice(0, 5).map((f) => `[${f.severity}][${f.id}] ${f.message}`),
        detail: gate.blocking.map((f) => f.message).join('\n'),
        batch: gate.batch,
      };
    }
    batch = gate.batch;
  }

  return { ok: true, batch };
}

async function runDualGates(args, teil, batch, relFile) {
  const { _rejectedReason: _r, _scoreEstimate: _s, ...cleanBatch } = batch;
  batch = cleanBatch;

  if (args.inMemory) {
    const gates = await runQualityAndStructuralGates(args, teil, batch, {});
    if (!gates.ok) return gates;
    return { ok: true, batch: gates.batch || batch };
  }

  const absPath = path.join(ROOT, relFile);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');

  const unlinkTmp = () => {
    try { fs.unlinkSync(absPath); } catch (_) { /* ignore */ }
  };

  if (!args.skipValidate) {
    const validation = validateBatchFile(args.lang, args.level, relFile);
    if (!validation.ok) {
      unlinkTmp();
      return {
        ok: false,
        gate: 'formato',
        issue: validationIssues(validation.output)[0] || 'Validación técnica fallida',
        issues: validationIssues(validation.output).slice(0, 5),
        detail: validation.output,
      };
    }
  }

  const gates = await runQualityAndStructuralGates(args, teil, batch, { onFail: unlinkTmp });
  if (!gates.ok) return gates;
  return { ok: true, batch: gates.batch || batch };
}

async function queuePause(session) {
  if (!session.lastApiCallAt) return;
  const elapsed = Date.now() - session.lastApiCallAt;
  if (elapsed < session.minPauseMs) {
    const wait = session.minPauseMs - elapsed;
    console.log(`Cola API: pausa ${(wait / 1000).toFixed(1)}s…`);
    await sleep(wait);
  }
}

function budgetRemaining(session) {
  return Math.max(0, session.maxApiCalls - session.apiCallsUsed);
}

async function callLlm(session, args, { prompt, maxTokens }) {
  return callGemini(session, args, { prompt, maxTokens });
}

async function callGemini(session, args, { prompt, maxTokens }) {
  if (session.apiCallsUsed >= session.maxApiCalls) {
    session.stopped = true;
    session.stopReason = 'max-api-calls';
    throw new ApiBudgetStopError();
  }

  await queuePause(session);

  const doCall = async () => {
    session.apiCallsUsed += 1;
    session.totalAttempts += 1;
    session.lastApiCallAt = Date.now();
    console.log(`Llamada API ${session.apiCallsUsed}/${session.maxApiCalls} · ${session.model}`);
    return generateGemini({
      prompt,
      maxTokens,
      model: session.model,
      jsonMode: true,
      // max503Retries: retries specifically for transient 5xx/503 errors.
      // Decoupled from apiRetries (quality/format retries) so 503s are
      // retried aggressively without consuming quality-retry budget.
      max503Retries: 8,
    });
  };

  try {
    return await doCall();
  } catch (err) {
    if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') throw err;
    if (!is429Error(err)) throw err;

    console.warn('\n⏳ 429 rate limit — esperando 60s para UN reintento…');
    await sleep(RATE_LIMIT_WAIT_MS);

    if (session.apiCallsUsed >= session.maxApiCalls) {
      session.stopped = true;
      session.stopReason = '429';
      throw new RateLimitStopError(
        'Gemini 429 tras esperar 60s y sin presupuesto de API restante. Para sin quemar más cuota.',
      );
    }

    await queuePause(session);
    try {
      return await doCall();
    } catch (err2) {
      session.stopped = true;
      session.stopReason = '429';
      throw new RateLimitStopError(
        `Gemini 429 persistente tras esperar 60s: ${err2.message}\nPara sin quemar más intentos.`,
      );
    }
  }
}

function finalizeIngest(args, teil, batch, basename, relFile) {
  console.log(
    `Guardado: ${relFile} (${batch.questions.length} preguntas, ${(batch.passages || []).length} passages)`,
  );

  if (args.skipValidate) {
    console.log('Validación omitida (--no-validate)');
  } else {
    console.log('Validación técnica OK ✅');
  }

  if (!args.skipQuality) {
    console.log('Calidad pedagógica OK ✅');
  }

  if (!args.skipIngest) {
    console.log('Comprobando pre-ingest (CEFR + staging)…');
    const ingest = checkLesenBatchIngest(batch, {
      lang: args.lang,
      level: args.level,
      batchId: basename,
    });
    console.log(formatIngestReport(ingest));
    if (!ingest.ok) {
      return { ok: false, discarded: true, teil, reason: 'pre-ingest', file: relFile };
    }
  }

  console.log(
    `Siguiente: node scripts/ingest-to-staging.mjs --lang ${args.lang} --level ${args.level} --file ${relFile} --auto-approve`,
  );
  return { ok: true, file: relFile, teil };
}

async function finalizeBatch(args, teil, batch, basename, relFile) {
  const gates = await runDualGates(args, teil, batch, relFile);
  if (!gates.ok) {
    return {
      ok: false,
      discarded: true,
      teil,
      reason: gates.issue,
      issue: gates.issue,
      issues: gates.issues,
      gate: gates.gate,
      detail: gates.detail,
      file: relFile,
      batch: gates.batch,
    };
  }
  batch = gates.batch || batch;
  if (args.inMemory && !args.writeFile) {
    return { ok: true, batch, teil };
  }
  if (args.inMemory && args.writeFile) {
    const absPath = path.join(ROOT, relFile);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    console.log(
      `Guardado: ${relFile} (${batch.questions.length} preguntas, ${(batch.passages || []).length} passages)`,
    );
    return { ok: true, batch, file: relFile, teil };
  }
  return finalizeIngest(args, teil, batch, basename, relFile);
}

async function generateT3Part(args, session) {
  const words = resolveTargetWords(args);
  if (!args.inMemory) {
    console.log(`\n── Lesen T3 · make-t3 (0 llamadas API) ──`);
    console.log(`Palabras objetivo (${words.length}): ${words.join(', ') || '(ninguna)'}`);
  }

  if (args.dryRun) {
    console.log('[dry-run] node scripts/make-t3.mjs --count 1 --out batches/generated');
    return { ok: true, dryRun: true, teil: 3, words, apiCalls: 0 };
  }

  if (args.inMemory) {
    try {
      let batch = buildValidatedT3Part({ words, maxAttempts: 8 });
      const topic =
        args._resolvedTopic ||
        args.topic ||
        pickNextTopic(GENERATED_DIR, { module: 'lesen', teil: 3 });
      batch = tagBatchWithTopic(batch, topic);
      batch.teil = 3;
      const tag = 'gemini';
      const basename = nextOutputBasename(3, tag);
      const relFile = args.writeFile
        ? path.relative(ROOT, path.join(GENERATED_DIR, basename)).replace(/\\/g, '/')
        : 'memory-t3.json';
      const result = await finalizeBatch(args, 3, batch, basename, relFile);
      if (result.ok) return { ...result, words, apiCalls: 0 };
      return { ...result, words, apiCalls: 0, discarded: true, teil: 3 };
    } catch (err) {
      return { ok: false, discarded: true, teil: 3, reason: err.message, apiCalls: 0 };
    }
  }

  const spawnArgs = [
    path.join('scripts', 'make-t3.mjs'),
    '--count',
    '1',
    '--out',
    'batches/generated',
  ];
  if (words.length) spawnArgs.push('--words', words.join(','));

  const res = spawnSync(process.execPath, spawnArgs, { cwd: ROOT, encoding: 'utf8' });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const match = out.match(/✅\s+(\S+\.json)/);
  if (res.status !== 0 || !match) {
    console.error(out.trim() || 'make-t3 falló sin salida');
    return { ok: false, discarded: true, teil: 3, reason: 'make-t3', apiCalls: 0 };
  }

  const relFile = match[1].replace(/\\/g, '/');
  const basename = path.basename(relFile);
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(path.join(ROOT, relFile), 'utf8'));
  } catch (err) {
    return { ok: false, discarded: true, teil: 3, reason: err.message, apiCalls: 0 };
  }

  return await finalizeBatch(args, 3, batch, basename, relFile);
}

async function generateLlmPart(args, teil, session) {
  args.teil = teil;
  const words = resolveTargetWords(args);
  const tag = 'gemini';

  const chosenTopic = args._resolvedTopic || pickNextTopic(GENERATED_DIR, { module: 'lesen', teil });
  console.log(`Tema: ${chosenTopic}${args.topic ? ' (elegido)' : ' (rotación)'}`);

  let promptBundle = buildLesenPromptBundle(teil, words, session);
  // Inyectar tema en el prompt
  promptBundle = {
    ...promptBundle,
    userPrompt: injectTopicIntoPrompt(promptBundle.userPrompt, chosenTopic),
    fullPrompt: promptBundle.fullPrompt
      ? injectTopicIntoPrompt(promptBundle.fullPrompt, chosenTopic)
      : promptBundle.fullPrompt,
  };
  let prompt = promptBundle.userPrompt;
  let baseUserPrompt = prompt;

  const resetPromptWithFix = (issues, gate) => {
    const note = buildFixNote(issues, gate);
    prompt = baseUserPrompt + note;
  };

  const resetPromptFresh = (hint) => {
    promptBundle = buildLesenPromptBundle(teil, words, session);
    prompt = hint
      ? `${promptBundle.userPrompt}\n\nNota: intento anterior rechazado por calidad (${hint}). Genera contenido NUEVO desde cero.`
      : promptBundle.userPrompt;
    baseUserPrompt = prompt;
  };

  const resolveMaxTokens = () => resolveMaxOutputTokens(session.provider, 'lesen', teil);

  const basename = nextOutputBasename(teil, tag);
  const outFile = path.join(GENERATED_DIR, basename);
  const relFile = path.relative(ROOT, outFile).replace(/\\/g, '/');
  let maxTokens = resolveMaxTokens();

  console.log(`\n── Lesen T${teil} · ${basename} ──`);
  console.log(`Proveedor: ${session.provider} · Palabras (${words.length}): ${words.join(', ')}`);
  console.log(`Modelo: ${session.model} · max_output_tokens=${maxTokens}`);

  if (args.dryRun) {
    console.log('\n[dry-run] Prompt (primeras 1200 chars):\n');
    console.log(prompt.slice(0, 1200) + (prompt.length > 1200 ? '…' : ''));
    console.log(`\n[dry-run] Se guardaría en: ${relFile}`);
    return { ok: true, dryRun: true, file: relFile, teil, words };
  }

  if (usesApiBudget(session.provider) && budgetRemaining(session) <= 0) {
    session.stopped = true;
    session.stopReason = 'max-api-calls';
    throw new ApiBudgetStopError();
  }

  let partAttempts = 0;
  let lastIssue = null;
  let lastBatch = null;

  for (let fix = 0; fix <= args.fixRetries; fix++) {
    partAttempts += 1;
    maxTokens = resolveMaxTokens();
    if (fix > 0) {
      console.log(`\nReintento ${fix}/${args.fixRetries} · ${lastIssue || 'checker'}…`);
    }

    let text;
    let usage;
    let stopReason;
    let lastApiError = null;

    for (let attempt = 1; attempt <= args.apiRetries; attempt++) {
      try {
        if (attempt > 1) console.log(`Reintento API ${attempt}/${args.apiRetries}…`);
        const result = await callLlm(session, args, { prompt, maxTokens });
        text = result.text;
        usage = result.usage;
        stopReason = result.stopReason;
        lastApiError = null;
        break;
      } catch (err) {
        if (
          err instanceof ApiBudgetStopError ||
          err instanceof RateLimitStopError ||
          err instanceof DailyQuotaError
        ) {
          throw err;
        }
        lastApiError = err;
        console.error(`Error ${session.provider}: ${err.message}`);
        if (attempt >= args.apiRetries) {
          if (fix >= args.fixRetries) {
            return {
              ok: false,
              discarded: true,
              teil,
              reason: err.message,
              attempts: partAttempts,
            };
          }
          lastIssue = err.message;
          break;
        }
      }
    }

    if (!text) {
      if (fix < args.fixRetries) {
        resetPromptWithFix(lastApiError?.message || 'sin respuesta del modelo', 'generación');
        continue;
      }
      return {
        ok: false,
        discarded: true,
        teil,
        reason: lastApiError?.message || 'sin respuesta del modelo',
        attempts: partAttempts,
      };
    }

    if (isLikelyTruncated(session.provider, usage, maxTokens, stopReason)) {
      const msg = `JSON truncado (max_output_tokens=${maxTokens})`;
      lastIssue = msg;
      if (fix < args.fixRetries) {
        resetPromptWithFix(msg, 'formato');
        continue;
      }
      return { ok: false, discarded: true, teil, reason: msg, attempts: partAttempts };
    }

    let batch;
    try {
      batch = extractJson(text);
    } catch (err) {
      lastIssue = err.message;
      if (fix < args.fixRetries) {
        resetPromptWithFix(err.message, 'formato');
        continue;
      }
      return { ok: false, discarded: true, teil, reason: err.message, attempts: partAttempts };
    }

    if (!batch || typeof batch !== 'object' || !Array.isArray(batch.questions)) {
      const msg = 'JSON raíz inválido (falta array questions)';
      lastIssue = msg;
      if (fix < args.fixRetries) {
        resetPromptWithFix(msg, 'formato');
        continue;
      }
      return { ok: false, discarded: true, teil, reason: msg, attempts: partAttempts };
    }

    batch = coerceGeneratedLesenPart(batch, {
      module: 'lesen',
      teil,
      lang: args.lang,
      level: args.level,
    });
    batch = tagBatchWithTopic(batch, chosenTopic);
    if (args._userVocab?.requested?.length) {
      batch = attachVocabFeedback(batch, args._userVocab.requested, {
        topic: chosenTopic,
        prompted: args._userVocab.prompted,
        excluded: args._userVocab.excluded,
      });
      console.log(formatVocabFeedbackSummary(batch.userVocabFeedback));
    }
    lastBatch = batch;

    if (!args.skipValidate) console.log('Validando formato…');
    if (!args.skipQuality && fix === 0) console.log('Comprobando calidad pedagógica…');

    let result = await finalizeBatch(args, teil, batch, basename, relFile);
    if (result.ok) {
      return { ...result, words, attempts: partAttempts, batch: result.batch || batch };
    }

    lastIssue = result.issue || result.reason || 'checker';

    // ── P2d: triaje de reparación (gratis, sin LLM) ──────────────────────────
    // Intentar antes de gastar un fixRetry pagado.
    {
      const triage = classifyAndRepair(batch, result);

      if (triage.discard) {
        const discardReason = triage.reason || lastIssue || 'triaje: descartar';
        console.log(`  Triaje CUBO D → DESCARTAR: ${discardReason}`);
        if (args.keepFailed && lastBatch) saveRejectedBatch(lastBatch, basename, discardReason);
        return { ok: false, discarded: true, teil, reason: discardReason, attempts: partAttempts };
      }

      if (triage.repaired === true) {
        const cubeLabel = triage.cube || '?';
        const fixedLabel = (triage.fixed || []).join(', ') || 'campos';
        console.log(`  Triaje CUBO ${cubeLabel}: reparado (${fixedLabel}) — re-validando sin LLM…`);
        batch = triage.batch;
        lastBatch = batch;

        const reResult = await finalizeBatch(args, teil, batch, basename, relFile);
        if (reResult.ok) {
          console.log(`  Triaje exitoso → guardado sin reintento LLM`);
          return { ...reResult, words, attempts: partAttempts, batch: reResult.batch || batch };
        }
        result = reResult;
        lastIssue = result.issue || result.reason || 'checker post-triage';
      }
    }

    if (fix >= args.fixRetries) {
      console.error(result.detail || result.reason || 'Puertas FAIL');
      if (args.keepFailed && lastBatch) {
        saveRejectedBatch(lastBatch, basename, lastIssue);
      }
      return { ...result, words, attempts: partAttempts };
    }

    resetPromptWithFix(result.issues || result.issue || result.reason, result.gate || 'checker');
  }

  return {
    ok: false,
    discarded: true,
    teil,
    reason: lastIssue || 'Generación fallida',
    attempts: partAttempts,
  };
}

async function generateOnePart(args, teil, session) {
  if (teil === 3) return generateT3Part(args, session);
  return generateLlmPart(args, teil, session);
}

/** Shared factory session for terminal + web hybrid (in-memory gates, no spawn). */
export function createLesenFactorySession(opts = {}) {
  const args = {
    lang: opts.lang || 'de',
    level: opts.level || 'B1',
    provider: 'gemini',
    model: opts.model || null,
    maxApiCalls: opts.maxApiCalls ?? 50,
    pauseMs: Math.max(MIN_PAUSE_MS, opts.pauseMs ?? MIN_PAUSE_MS),
    fixRetries: opts.fixRetries ?? 2,
    apiRetries: opts.apiRetries ?? 1,
    skipValidate: true,
    skipQuality: false,
    skipIngest: true,
    skipDedup: opts.skipDedup ?? true,
    inMemory: true,
    writeFile: opts.writeFile ?? false,
    keepFailed: false,
    dryRun: false,
    topic: opts.topic || null,
    words: opts.words || null,
    dedupCorpus: opts.dedupCorpus ?? null,
    dedupThreshold: opts.dedupThreshold ?? 0.55,
  };
  args.provider = 'gemini';
  const session = createSession(args);
  return { session, args };
}

/**
 * Generate one Lesen part via Gemini factory (T3 = make-t3, no API).
 * @returns {Promise<{ ok: boolean, batch?: object, ms: number, apiCalls?: number, reason?: string }>}
 */
export async function generateLesenPart(opts = {}) {
  const t0 = Date.now();
  let session;
  let args;

  if (opts.session?.session && opts.session?.args) {
    ({ session, args } = opts.session);
  } else {
    ({ session, args } = createLesenFactorySession(opts));
  }

  const teil = Number(opts.teil);
  if (!Number.isFinite(teil) || teil < 1 || teil > 5) {
    return { ok: false, reason: 'invalid_teil', ms: Date.now() - t0 };
  }

  args.teil = teil;
  args.topic = opts.topic ?? args.topic;
  args._resolvedTopic = opts.topic ?? args._resolvedTopic ?? args.topic;
  if (Array.isArray(opts.words) && opts.words.length) {
    args.words = [...opts.words];
  }
  args.fixRetries = opts.fixRetries ?? args.fixRetries;
  args.inMemory = true;
  args.writeFile = opts.writeFile ?? args.writeFile ?? false;
  args.skipDedup = opts.skipDedup ?? args.skipDedup;
  if (opts.dedupCorpus != null) {
    args.dedupCorpus = opts.dedupCorpus;
    args.skipDedup = opts.skipDedup ?? !opts.dedupCorpus?.length;
  }

  try {
    const result = await generateOnePart(args, teil, session);
    const ms = Date.now() - t0;
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason || result.issue || 'generation_failed',
        ms,
        apiCalls: session.apiCallsUsed,
        teil,
        gate: result.gate,
        issues: result.issues,
      };
    }
    let batch = result.batch;
    if (!batch && result.file) {
      batch = JSON.parse(fs.readFileSync(path.join(ROOT, result.file), 'utf8'));
    }
    return {
      ok: true,
      batch,
      ms,
      apiCalls: session.apiCallsUsed,
      teil,
      file: result.file || null,
      words: result.words,
      session: { session, args },
    };
  } catch (err) {
    if (
      err instanceof ApiBudgetStopError ||
      err instanceof RateLimitStopError ||
      err instanceof DailyQuotaError
    ) {
      throw err;
    }
    return {
      ok: false,
      reason: err.message || 'generation_error',
      ms: Date.now() - t0,
      apiCalls: session.apiCallsUsed,
      teil,
    };
  }
}

function recordResult(session, result) {
  const t = result.teil;
  if (!session.byTeil[t]) session.byTeil[t] = { generated: 0, discarded: 0, attempts: 0 };
  if (result.attempts) session.byTeil[t].attempts += result.attempts;
  if (result.ok && !result.dryRun) session.byTeil[t].generated += 1;
  else if (result.discarded) session.byTeil[t].discarded += 1;
}

function printFinalSummary(session, args) {
  const saved = Object.values(session.byTeil).reduce((n, s) => n + (s?.generated || 0), 0);
  const discarded = Object.values(session.byTeil).reduce((n, s) => n + (s?.discarded || 0), 0);

  console.log('\n══ Resumen generador Lesen ══');
  console.log(`Proveedor: ${session.provider} · Modelo: ${session.model}`);
  console.log(`Intentos totales: ${session.totalAttempts}`);
  console.log(`Partes guardadas (formato + calidad OK): ${saved}`);
  console.log(`Partes descartadas: ${discarded}`);
  console.log(`Llamadas API Gemini: ${session.apiCallsUsed}/${session.maxApiCalls}`);
  console.log('Por Teil (guardadas / descartadas · intentos):');
  for (const t of [1, 2, 3, 4, 5]) {
    const s = session.byTeil[t];
    if (!s || (s.generated === 0 && s.discarded === 0 && s.attempts === 0)) continue;
    const apiNote = t === 3 ? ' (T3 sin API)' : '';
    console.log(
      `  T${t}: ${s.generated} guardadas, ${s.discarded} descartadas, ${s.attempts} intentos${apiNote}`,
    );
  }
  if (session.stopped && usesApiBudget(session.provider)) {
    if (session.stopReason === 'max-api-calls') {
      console.log('\ncuota diaria alcanzada, continúa mañana');
    } else if (session.stopReason === '429') {
      console.log('\nDetenido por rate limit 429 persistente — reanuda más tarde.');
    }
  }
}

export async function runLesenGenerator(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  args.provider = await resolveLesenProvider(args.provider);
  if (args.fixRetries == null) {
    args.fixRetries = 0;
  }

  const teile = teileToRun(args);
  const session = createSession(args);

  if (!args.dryRun && !args.fromCoverage && !args.fromBank && !args.words?.length) {
    throw new Error('Indica --from-coverage, --from-bank o --words');
  }

  if (
    !args.dryRun &&
    teile.some((t) => t !== 3) &&
    !process.env.GEMINI_API_KEY &&
    !process.env.GOOGLE_API_KEY
  ) {
    throw new Error('Falta GEMINI_API_KEY en .env');
  }

  if (args.refreshCoverage) refreshCoverageReport(args.lang, args.level);

  console.log(
    `\nGenerador Lesen (${args.lang}/${args.level}) · ${args.provider} · ${session.model} · Teile: ${teile.join(', ')} × ${args.count}`,
  );
  if (!args.words?.length) {
    console.log(`Palabras objetivo por parte: ${args.wordCount} (--word-count)`);
  } else {
    console.log(
      `Palabras objetivo por parte: ${Math.min(args.words.length, args.wordCount)} de ${args.words.length} en --words (tope --word-count ${args.wordCount})`,
    );
  }
  logCefrCoverageThreshold();
  console.log(
    `Cuota Gemini: max ${session.maxApiCalls} llamadas · pausa ≥${session.minPauseMs}ms · api-retries=${args.apiRetries}`,
  );
  console.log(`Salida: batches/generated/`);

  const results = [];
  // Kill-switch: stop the batch after this many consecutive parts that all
  // exhausted their 503 retries (= Gemini is down, not just a short spike).
  const MAX_CONSECUTIVE_503 = 3;
  let consecutive503Failures = 0;

  outer: for (const teil of teile) {
    for (let i = 0; i < args.count; i++) {
      if (
        usesApiBudget(session.provider) &&
        teil !== 3 &&
        !args.dryRun &&
        budgetRemaining(session) <= 0
      ) {
        session.stopped = true;
        session.stopReason = 'max-api-calls';
        console.log('\ncuota diaria alcanzada, continúa mañana');
        break outer;
      }

      if (args.count > 1 || teile.length > 1) {
        console.log(`\n======== T${teil} · ${i + 1}/${args.count} ========`);
      }

      try {
        const result = await generateOnePart(args, teil, session);
        recordResult(session, result);
        results.push(result);
        // Reset 503 counter on any successful or quality-failed (non-503) result
        if (!result.reason || !/503|reintentos agotados/i.test(String(result.reason))) {
          consecutive503Failures = 0;
        } else {
          consecutive503Failures += 1;
        }
        if (session.stopped) break outer;
      } catch (err) {
        if (err instanceof ApiBudgetStopError) {
          console.log('\ncuota diaria alcanzada, continúa mañana');
          session.stopped = true;
          session.stopReason = 'max-api-calls';
          break outer;
        }
        if (err instanceof RateLimitStopError) {
          console.error(`\n${err.message}`);
          session.stopped = true;
          session.stopReason = '429';
          break outer;
        }
        if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') {
          throw err;
        }
        console.error(err.message || err);
        session.byTeil[teil].discarded += 1;
        results.push({ ok: false, discarded: true, teil, reason: err.message });
      }

      // After each discarded part, check if it was a 503 exhaustion
      const last = results[results.length - 1];
      if (last && !last.ok && /503|reintentos agotados/i.test(String(last.reason || ''))) {
        consecutive503Failures += 1;
        if (consecutive503Failures >= MAX_CONSECUTIVE_503) {
          console.error(
            `\n🛑 ${consecutive503Failures} partes consecutivas agotaron reintentos de 503.` +
            ` Gemini parece caído — deteniendo lote. Reintenta en unos minutos.`,
          );
          session.stopped = true;
          session.stopReason = '503-exhausted';
          break outer;
        }
      } else if (last && last.ok) {
        consecutive503Failures = 0;
      }
    }
  }

  printFinalSummary(session, args);

  const ok = results.filter((r) => r.ok).length;
  if (session.stopped && session.stopReason === 'max-api-calls') {
    return { ok: ok > 0, results, session, exitCode: EXIT_API_BUDGET };
  }
  if (session.stopped && session.stopReason === '429') {
    return { ok: ok > 0, results, session, exitCode: EXIT_RATE_LIMIT };
  }
  return { ok: ok === results.length, results, session, exitCode: ok === results.length ? 0 : 1 };
}

export {
  callLlm,
  usesApiBudget,
  budgetRemaining,
  MIN_PAUSE_MS,
  DEFAULT_WORD_COUNT,
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  runLesenGenerator(process.argv.slice(2))
    .then(({ exitCode }) => process.exit(exitCode ?? 0))
    .catch((err) => {
      if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') {
        console.error(`\n${err.message}`);
        process.exit(EXIT_DAILY_QUOTA);
      }
      console.error(err.message || err);
      process.exit(1);
    });
}
