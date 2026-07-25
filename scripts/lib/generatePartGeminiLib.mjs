/**
 * Generación Gemini (y otros providers) para Hören / Schreiben / Sprechen B1.
 * Puertas: validate-batch + checker pedagógico del módulo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { ROOT } from './loadEnv.mjs';
import { extractJson } from './extractJson.mjs';
import { resolveMaxOutputTokens, isLikelyTruncated } from './genOutputTokens.mjs';
import { buildExamPrompt } from './examTemplatePrompt.mjs';
import {
  loadWeakLemmas,
  pickRandomWords,
  pickTargetWords,
} from './lesenTemplatePrompt.mjs';
import { checkHorenBatchQuality, formatHorenQualityReport } from './horenBatchQuality.mjs';
import {
  checkPromptBatchQuality,
  formatPromptQualityReport,
} from './promptBatchQuality.mjs';
import { normalizeBatch } from './normalizeBatch.mjs';
import { nextExamOutputBasename } from './pasteExamBatchLib.mjs';
import { validatePart, buildDedupCorpusFromDir } from './partGate.mjs';
import { checkLexical, formatLexicalReport } from './lexicalCheck.mjs';
import { classifyAndRepair } from './repairTriage.mjs';
import { pickNextTopic, injectTopicIntoPrompt, tagBatchWithTopic } from './topicRotation.mjs';
import { resolveGenerationVocab, resolveTargetWordsForArgs } from './resolveGenerationInput.mjs';
import { attachVocabFeedback, formatVocabFeedbackSummary } from './generationFeedback.mjs';
import { DailyQuotaError } from './geminiClient.mjs';
import {
  ApiBudgetStopError,
  RateLimitStopError,
  callLlm,
  usesApiBudget,
  budgetRemaining,
  MIN_PAUSE_MS,
  DEFAULT_WORD_COUNT,
  resolveLesenProvider,
  resolveProviderModel,
} from '../generate-lesen-part-gemini.mjs';

export { DailyQuotaError, ApiBudgetStopError, RateLimitStopError };

const GENERATED_DIR = path.join(ROOT, 'batches', 'generated');
const EXIT_DAILY_QUOTA = 2;
const EXIT_RATE_LIMIT = 3;
const EXIT_API_BUDGET = 4;
const SUPPORTED_MODULES = new Set(['horen', 'schreiben', 'sprechen']);

export function parseExamArgs(argv) {
  const out = {
    module: null,
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
    if (a === '--module') out.module = String(argv[++i] || '').toLowerCase();
    else if (a === '--lang') out.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--teil') out.teil = Number(argv[++i]);
    else if (a === '--teile') {
      out.teileList = String(argv[++i] || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 4);
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
  if (!out.module || !SUPPORTED_MODULES.has(out.module)) {
    throw new Error('Indica --module horen|schreiben|sprechen');
  }
  return out;
}

export function summaryKey(module, teil) {
  if (module === 'schreiben' || module === 'sprechen') return module;
  return `T${teil}`;
}

export function teileToRunExam(args) {
  const mod = args.module;
  if (mod === 'horen') {
    if (args.teileList?.length) return [...new Set(args.teileList)].sort((a, b) => a - b);
    if (args.allTeile) return [1, 2, 3, 4];
    if (Number.isFinite(args.teil) && args.teil >= 1 && args.teil <= 4) return [args.teil];
    throw new Error('Hören: indica --teil 1..4, --teile 1,2,3 o --all-teile');
  }
  return [null];
}

function createSession(args, runKeys) {
  const byKey = {};
  for (const k of runKeys) {
    byKey[k] = { generated: 0, discarded: 0, attempts: 0 };
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
    byKey,
  };
}

function refreshCoverageReport(lang, level) {
  console.log('Actualizando reporte de cobertura…');
  execSync(`node scripts/vocab-coverage-report.mjs --lang ${lang} --level ${level}`, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function resolveTargetWords(args) {
  return resolveTargetWordsForArgs(args, { module: args.module, teil: args.teil ?? 1 });
}

function validateBatchFile(lang, level, relFile) {
  const res = spawnSync(
    process.execPath,
    ['scripts/validate-batch.mjs', '--lang', lang, '--level', level, '--file', relFile, '--allow-dup'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return { ok: res.status === 0, output: `${res.stdout || ''}${res.stderr || ''}`.trim() };
}

function validationIssues(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('==') && !l.startsWith('Preguntas:') && !l.startsWith('Esquema:'));
}

function buildExamFixNote(issues, gate, module) {
  const list = (Array.isArray(issues) ? issues : [issues]).filter(Boolean).slice(0, 6);
  let extra = '';
  if (list.some((i) => /copia|literal|word-matching|comparten/i.test(String(i)))) {
    extra =
      '\nANTI WORD-MATCHING: parafrasea preguntas/opciones; no copies ≥4 palabras seguidas del audio.';
  }
  if (module === 'horen' && list.some((i) => /dialogo|turnos|Person A/i.test(String(i)))) {
    extra += '\nUsa turnos «Nombre:» alternados en transcripciones de diálogo/discusión.';
  }
  if ((module === 'schreiben' || module === 'sprechen') && list.some((i) => /Wörter|argument|Sie|planen/i.test(String(i)))) {
    extra += '\nRevisa la rúbrica Goethe: longitud, registro, puntos/bullets pedidos en la consigna.';
  }
  return (
    `\n\n--- CORRECCIÓN REQUERIDA ---\n` +
    `El checker de ${gate} detectó:\n${list.map((i) => `- ${i}`).join('\n')}${extra}\n` +
    `Corrige SOLO esos problemas. Devuelve el JSON completo corregido, sin markdown ni comentarios.`
  );
}

function runModuleQuality(batch, args, teil) {
  const mod = args.module;
  if (mod === 'horen') {
    const quality = checkHorenBatchQuality(batch, teil);
    return {
      ok: quality.ok,
      issues: quality.issues || [],
      report: formatHorenQualityReport(quality, teil),
    };
  }
  const issues = [];
  const reports = [];
  for (const t of [1, 2, 3]) {
    const quality = checkPromptBatchQuality(batch, mod, t, {
      lang: args.lang,
      level: args.level,
    });
    reports.push(formatPromptQualityReport(quality, mod, t));
    if (!quality.ok) issues.push(...(quality.issues || []));
  }
  return {
    ok: issues.length === 0,
    issues,
    report: reports.join('\n'),
  };
}

async function runDualGates(args, teil, batch, relFile) {
  const absPath = path.join(ROOT, relFile);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  // Strip rejection metadata that should never appear in approved files
  const { _rejectedReason: _r, _scoreEstimate: _s, ...cleanBatch } = batch;
  batch = cleanBatch;
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

  if (!args.skipQuality) {
    const quality = runModuleQuality(batch, args, teil);
    console.log(quality.report);
    if (!quality.ok) {
      unlinkTmp();
      return {
        ok: false,
        gate: 'calidad',
        issue: quality.issues?.[0] || 'Calidad pedagógica FAIL',
        issues: (quality.issues || []).slice(0, 5),
        detail: quality.report,
      };
    }
  }

  // Gate: léxico contextual
  if (!args.skipQuality) {
    const lex = checkLexical(batch);
    if (!lex.ok) {
      console.log(formatLexicalReport(lex));
      unlinkTmp();
      return {
        ok: false,
        gate: 'lexico',
        issue: lex.issues[0] || 'Error léxico',
        issues: lex.issues.slice(0, 5),
        detail: formatLexicalReport(lex),
      };
    }
    if (lex.warnings?.length) console.log(formatLexicalReport(lex));
  }

  if (!args.skipQuality) {
    let dedupCorpus = null;
    if (!args.skipDedup) {
      try {
        const currentIds = new Set((batch.passages || []).map((p) => p.id).filter(Boolean));
        dedupCorpus = buildDedupCorpusFromDir(GENERATED_DIR, fs, path)
          .filter((e) => !currentIds.has(e.id));
      } catch (e) {
        console.warn(`  ⚠ dedup corpus omitido: ${e.message}`);
      }
    }

    const gate = await validatePart(batch, {
      semantic: false,
      skipNormalize: true,
      skipDedup: args.skipDedup,
      dedupCorpus,
      dedupThreshold: args.dedupThreshold ?? 0.55,
      module: args.module,
      teil,
      lang: args.lang,
      level: args.level,
    });

    if (gate.dedup?.warnings?.length) {
      for (const w of gate.dedup.warnings) console.log(`  ⚠ dedup: ${w}`);
    }

    if (!gate.ok) {
      const first = gate.blocking[0];
      const isDedup = first?.id === 'DEDUP';
      const issue = first?.message || (isDedup ? 'Deduplicación FAIL' : 'audit-pass-2 IMPORTANT');
      if (isDedup) console.log(`Deduplicación FAIL: ${issue}`);
      else console.log(`Audit-pass-2 BLOQUEADO: [${first?.severity}][${first?.id}] ${issue}`);
      unlinkTmp();
      return {
        ok: false,
        gate: isDedup ? 'dedup' : 'audit2',
        issue,
        issues: gate.blocking.slice(0, 5).map((f) => `[${f.severity}][${f.id}] ${f.message}`),
        detail: gate.blocking.map((f) => f.message).join('\n'),
      };
    }
  }

  return { ok: true };
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

function buildExamPromptBundle(module, teil, words, session) {
  const idSuffix = randomBytes(4).toString('hex');
  const promptTeil = module === 'horen' ? teil : 1;
  const fullPrompt = buildExamPrompt(module, promptTeil, words, { idSuffix });
  return { idSuffix, fullPrompt, systemPrompt: null, userPrompt: fullPrompt };
}

function finalizeSaved(args, module, teil, batch, relFile) {
  const teilLabel = teil != null ? `Teil ${teil}` : 'Teile 1–3';
  console.log(
    `Guardado: ${relFile} (${batch.questions.length} preguntas, ${(batch.passages || []).length} passages) · ${module} ${teilLabel}`,
  );
  console.log('Validación técnica OK ✅');
  if (!args.skipQuality) console.log('Calidad pedagógica OK ✅');
  return { ok: true, file: relFile, module, teil, key: summaryKey(module, teil) };
}

async function generateExamPart(args, teil, session) {
  args.teil = teil;
  const words = resolveTargetWords(args);
  const module = args.module;
  const tag = 'gemini';

  const chosenTopic = args._resolvedTopic || pickNextTopic(GENERATED_DIR, { module, teil });
  console.log(`Tema: ${chosenTopic}${args.topic ? ' (elegido)' : ' (rotación)'}`);

  let promptBundle = buildExamPromptBundle(module, teil, words, session);
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
    const note = buildExamFixNote(issues, gate, module);
    prompt = baseUserPrompt + note;
  };

  const tokenTeil = teil ?? 1;
  const resolveMaxTokens = () => resolveMaxOutputTokens(session.provider, module, tokenTeil);

  const basename = nextExamOutputBasename(module, teil, tag);
  const outFile = path.join(GENERATED_DIR, basename);
  const relFile = path.relative(ROOT, outFile).replace(/\\/g, '/');
  let maxTokens = resolveMaxTokens();

  const key = summaryKey(module, teil);
  const teilLabel = teil != null ? `T${teil}` : module;
  console.log(`\n── ${module} ${teilLabel} · ${basename} ──`);
  console.log(`Proveedor: ${session.provider} · Palabras (${words.length}): ${words.join(', ')}`);
  console.log(`Modelo: ${session.model} · max_output_tokens=${maxTokens}`);

  if (args.dryRun) {
    console.log('\n[dry-run] Prompt (primeras 1200 chars):\n');
    console.log(prompt.slice(0, 1200) + (prompt.length > 1200 ? '…' : ''));
    console.log(`\n[dry-run] Se guardaría en: ${relFile}`);
    return { ok: true, dryRun: true, file: relFile, module, teil, key, words };
  }

  if (usesApiBudget(session.provider) && budgetRemaining(session) <= 0) {
    session.stopped = true;
    session.stopReason = 'max-api-calls';
    throw new ApiBudgetStopError();
  }

  let partAttempts = 0;
  let lastIssue = null;
  let lastBatch = null;
  // Snapshot of GEMINI_TEMPERATURE before this generation so we can restore it
  const origGeminiTemp = process.env.GEMINI_TEMPERATURE;
  // When truncation is detected we scale up tokens instead of adding a fix note
  let scaledMaxTokens = null;
  // Set to true at end of a quality-gate failure so next iteration lowers temperature
  let qualityRetry = false;

  for (let fix = 0; fix <= args.fixRetries; fix++) {
    partAttempts += 1;
    // Use scaled tokens if a truncation retry is in progress, otherwise resolve fresh
    maxTokens = scaledMaxTokens ?? resolveMaxTokens();
    if (fix > 0) {
      console.log(`\nReintento ${fix}/${args.fixRetries} · ${lastIssue || 'checker'}…`);
      // Temperature: lower to 0.3 for quality retries, restore original otherwise
      if (qualityRetry) {
        process.env.GEMINI_TEMPERATURE = '0.3';
        console.log('  Temperatura reducida a 0.3 (reintento de calidad)');
      } else if (origGeminiTemp !== undefined) {
        process.env.GEMINI_TEMPERATURE = origGeminiTemp;
      } else {
        delete process.env.GEMINI_TEMPERATURE;
      }
    }
    qualityRetry = false; // reset here; will be re-set at end if quality gate fails again

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
        if (attempt >= args.apiRetries) break;
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
        module,
        teil,
        key,
        reason: lastApiError?.message || 'sin respuesta del modelo',
        attempts: partAttempts,
      };
    }

    if (isLikelyTruncated(session.provider, usage, maxTokens, stopReason)) {
      const msg = `JSON truncado (max_output_tokens=${maxTokens})`;
      lastIssue = msg;
      if (fix < args.fixRetries) {
        const HARD_CAP = 8192;
        const next = Math.min(Math.round(maxTokens * 1.5), HARD_CAP);
        if (next > maxTokens) {
          scaledMaxTokens = next;
          console.log(`  Truncación → subiendo maxOutputTokens a ${scaledMaxTokens} (prompt sin cambios)`);
        } else {
          console.log(`  Truncación → ya en tope ${HARD_CAP}, reintentando sin cambios`);
        }
        // No se añade buildExamFixNote — el prompt no empeora la truncación
        continue;
      }
      return { ok: false, discarded: true, module, teil, key, reason: msg, attempts: partAttempts };
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
      return { ok: false, discarded: true, module, teil, key, reason: err.message, attempts: partAttempts };
    }

    if (!batch || typeof batch !== 'object' || !Array.isArray(batch.questions)) {
      const msg = 'JSON raíz inválido (falta array questions)';
      lastIssue = msg;
      if (fix < args.fixRetries) {
        resetPromptWithFix(msg, 'formato');
        continue;
      }
      return { ok: false, discarded: true, module, teil, key, reason: msg, attempts: partAttempts };
    }

    batch = normalizeBatch(batch, {
      module,
      teil: teil ?? undefined,
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

    const gates = await runDualGates(args, teil, batch, relFile);
    if (gates.ok) {
      return { ...finalizeSaved(args, module, teil, batch, relFile), words, attempts: partAttempts };
    }

    // ── P2d: triaje de reparación (gratis, sin LLM) ──────────────────────────
    // Intentar antes de gastar un fixRetry pagado.
    {
      const triage = classifyAndRepair(batch, gates);

      if (triage.discard) {
        // Cubo D: descartar directamente sin consumir reintentos
        const discardReason = triage.reason || gates.issue || 'triaje: descartar';
        console.log(`  Triaje CUBO D → DESCARTAR: ${discardReason}`);
        if (args.keepFailed && lastBatch) saveRejectedBatch(lastBatch, basename, discardReason);
        return {
          ok: false, discarded: true, module, teil, key,
          reason: discardReason, attempts: partAttempts,
        };
      }

      if (triage.repaired === true) {
        // Cubo A o B: reparado en código — re-validar sin consumir un fixRetry
        const cubeLabel = triage.cube || '?';
        const fixedLabel = (triage.fixed || []).join(', ') || 'campos';
        console.log(`  Triaje CUBO ${cubeLabel}: reparado (${fixedLabel}) — re-validando sin LLM…`);
        batch = triage.batch;
        lastBatch = batch;

        const reGates = await runDualGates(args, teil, batch, relFile);
        if (reGates.ok) {
          console.log(`  Triaje exitoso → guardado sin reintento LLM`);
          return { ...finalizeSaved(args, module, teil, batch, relFile), words, attempts: partAttempts };
        }

        // Parcialmente resuelto: actualizar gates con el estado post-reparación
        if (triage.partialOnly) {
          console.log(`  Triaje parcial → fallos residuales (${reGates.gate}), continúa con LLM`);
        }
        // Fall through with updated gates for normal LLM retry
        Object.assign(gates, reGates);
      }
      // Cubo C o sin reparación → caída directa al reintento LLM normal
    }
    // ── Fin triaje ────────────────────────────────────────────────────────────

    lastIssue = gates.issue || gates.reason || 'checker';
    if (fix >= args.fixRetries) {
      console.error(gates.detail || lastIssue);
      if (args.keepFailed && lastBatch) {
        saveRejectedBatch(lastBatch, basename, lastIssue);
      }
      return {
        ok: false,
        discarded: true,
        module,
        teil,
        key,
        reason: lastIssue,
        issues: gates.issues,
        gate: gates.gate,
        attempts: partAttempts,
      };
    }

    const isQualityGate = /^(calidad|audit2|lexico)$/.test(gates.gate || '');
    if (isQualityGate) {
      if (fix === 0 && args.fixRetries > 1) {
        console.log('Calidad FAIL → regeneración limpia en siguiente intento si persiste…');
      }
      if (fix < args.fixRetries) {
        qualityRetry = true;      // next iteration uses temperature 0.3
        scaledMaxTokens = null;   // release any token scaling from a prior truncation
      }
    }
    resetPromptWithFix(gates.issues || gates.issue || gates.reason, gates.gate || 'checker');
  }

  return {
    ok: false,
    discarded: true,
    module,
    teil,
    key,
    reason: lastIssue || 'Generación fallida',
    attempts: partAttempts,
  };
}

function recordResult(session, result) {
  const key = result.key || summaryKey(result.module, result.teil);
  if (!session.byKey[key]) session.byKey[key] = { generated: 0, discarded: 0, attempts: 0 };
  if (result.attempts) session.byKey[key].attempts += result.attempts;
  if (result.ok && !result.dryRun) session.byKey[key].generated += 1;
  else if (result.discarded) session.byKey[key].discarded += 1;
}

function printFinalSummary(session, args) {
  const saved = Object.values(session.byKey).reduce((n, s) => n + (s?.generated || 0), 0);
  const discarded = Object.values(session.byKey).reduce((n, s) => n + (s?.discarded || 0), 0);

  console.log(`\n══ Resumen generador ${args.module} ══`);
  console.log(`Proveedor: ${session.provider} · Modelo: ${session.model}`);
  console.log(`Intentos totales: ${session.totalAttempts}`);
  console.log(`Partes guardadas (formato + calidad OK): ${saved}`);
  console.log(`Partes descartadas: ${discarded}`);
  if (session.provider === 'gemini') {
    console.log(`Llamadas API Gemini: ${session.apiCallsUsed}/${session.maxApiCalls}`);
  }
  console.log('Por parte (guardadas / descartadas · intentos):');
  for (const [key, s] of Object.entries(session.byKey)) {
    if (!s || (s.generated === 0 && s.discarded === 0 && s.attempts === 0)) continue;
    console.log(`  ${key}: ${s.generated} guardadas, ${s.discarded} descartadas, ${s.attempts} intentos`);
  }
  if (session.stopped && usesApiBudget(session.provider)) {
    if (session.stopReason === 'max-api-calls') {
      console.log('\ncuota diaria alcanzada, continúa mañana');
    } else if (session.stopReason === '429') {
      console.log('\nDetenido por rate limit 429 persistente — reanuda más tarde.');
    }
  }
}

/** Factory session for pool-fill (validated batch written to batches/generated/). */
export async function createExamFactorySession(opts = {}) {
  const module = String(opts.module || '').toLowerCase();
  if (!SUPPORTED_MODULES.has(module)) {
    throw new Error(`Módulo no soportado: ${module}. Usa horen, schreiben o sprechen.`);
  }
  const args = {
    module,
    lang: opts.lang || 'de',
    level: opts.level || 'B1',
    teil: opts.teil ?? null,
    provider: 'gemini',
    model: opts.model || null,
    maxApiCalls: opts.maxApiCalls ?? 50,
    pauseMs: Math.max(MIN_PAUSE_MS, opts.pauseMs ?? MIN_PAUSE_MS),
    fixRetries: opts.fixRetries ?? 2,
    apiRetries: opts.apiRetries ?? 1,
    skipValidate: false,
    skipQuality: false,
    keepFailed: false,
    dryRun: false,
    topic: opts.topic || null,
    words: opts.words || null,
    _resolvedTopic: opts.topic || null,
  };
  args.provider = await resolveLesenProvider(args.provider);
  const teile = opts.teil != null ? [opts.teil] : teileToRunExam(args);
  const runKeys = teile.map((t) => summaryKey(module, t));
  const session = createSession(args, runKeys);
  return { session, args };
}

/**
 * Generate one exam module part (Hören/Schreiben/Sprechen) with gates; file in batches/generated/.
 */
export async function generateExamPartSingle(opts = {}) {
  const t0 = Date.now();
  let session;
  let args;

  if (opts.session?.session && opts.session?.args) {
    ({ session, args } = opts.session);
  } else {
    ({ session, args } = await createExamFactorySession(opts));
  }

  const teil = opts.teil ?? args.teil ?? null;
  if (opts.topic) {
    args.topic = opts.topic;
    args._resolvedTopic = opts.topic;
  }
  if (Array.isArray(opts.words) && opts.words.length) {
    args.words = [...opts.words];
  }
  args.fixRetries = opts.fixRetries ?? args.fixRetries;

  try {
    const result = await generateExamPart(args, teil, session);
    const ms = Date.now() - t0;
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason || result.issue || 'generation_failed',
        ms,
        apiCalls: session.apiCallsUsed,
        module: args.module,
        teil,
        gate: result.gate,
        issues: result.issues,
        file: result.file || null,
      };
    }
    return {
      ok: true,
      file: result.file,
      ms,
      apiCalls: session.apiCallsUsed,
      module: args.module,
      teil,
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
      module: args.module,
      teil,
    };
  }
}

export async function runExamGenerator(argv = process.argv.slice(2)) {
  const args = parseExamArgs(argv);
  args.provider = await resolveLesenProvider(args.provider);
  if (args.fixRetries == null) {
    args.fixRetries = 0;
  }

  const teile = teileToRunExam(args);
  const runKeys = teile.map((t) => summaryKey(args.module, t));
  const session = createSession(args, runKeys);

  if (!args.dryRun && !args.fromCoverage && !args.fromBank && !args.words?.length) {
    throw new Error('Indica --from-coverage, --from-bank o --words');
  }

  if (
    !args.dryRun &&
    args.provider === 'gemini' &&
    !process.env.GEMINI_API_KEY &&
    !process.env.GOOGLE_API_KEY
  ) {
    throw new Error('Falta GEMINI_API_KEY en .env');
  }

  if (args.refreshCoverage) refreshCoverageReport(args.lang, args.level);

  const teilLabel =
    args.module === 'horen' ? teile.map((t) => `T${t}`).join(', ') : 'Teile 1–3';
  console.log(
    `\nGenerador ${args.module} (${args.lang}/${args.level}) · ${args.provider} · ${session.model} · ${teilLabel} × ${args.count}`,
  );
  if (!args.words?.length) {
    console.log(`Palabras objetivo por parte: ${args.wordCount} (--word-count)`);
  }
  if (args.provider === 'gemini') {
    console.log(
      `Cuota Gemini: max ${session.maxApiCalls} llamadas · pausa ≥${session.minPauseMs}ms · fix-retries=${args.fixRetries} · api-retries=${args.apiRetries}`,
    );
  }
  console.log('Salida: batches/generated/ (solo pasa formato + calidad pedagógica)');

  const results = [];
  // Kill-switch: stop the batch after this many consecutive parts that all
  // exhausted their 503 retries (= Gemini is down, not just a short spike).
  const MAX_CONSECUTIVE_503 = 3;
  let consecutive503Failures = 0;

  outer: for (const teil of teile) {
    for (let i = 0; i < args.count; i++) {
      if (usesApiBudget(session.provider) && !args.dryRun && budgetRemaining(session) <= 0) {
        session.stopped = true;
        session.stopReason = 'max-api-calls';
        console.log('\ncuota diaria alcanzada, continúa mañana');
        break outer;
      }

      if (args.count > 1 || teile.length > 1) {
        const label = teil != null ? `T${teil}` : args.module;
        console.log(`\n======== ${label} · ${i + 1}/${args.count} ========`);
      }

      try {
        const result = await generateExamPart(args, teil, session);
        recordResult(session, result);
        results.push(result);
        if (session.stopped) break outer;
      } catch (err) {
        if (err instanceof ApiBudgetStopError) {
          session.stopped = true;
          session.stopReason = 'max-api-calls';
          console.log('\ncuota diaria alcanzada, continúa mañana');
          break outer;
        }
        if (err instanceof RateLimitStopError) {
          console.error(`\n${err.message}`);
          session.stopped = true;
          session.stopReason = '429';
          break outer;
        }
        if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') throw err;
        console.error(err.message || err);
        const key = summaryKey(args.module, teil);
        if (!session.byKey[key]) session.byKey[key] = { generated: 0, discarded: 0, attempts: 0 };
        session.byKey[key].discarded += 1;
        results.push({ ok: false, discarded: true, module: args.module, teil, key, reason: err.message });
      }

      // After each part, check if the last result was a 503 exhaustion
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
