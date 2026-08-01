/**
 * Generación Gemini (y otros providers) para Hören / Schreiben / Sprechen B1.
 * Puertas: validate-batch + checker pedagógico del módulo.
 *
 * Cost logging: callLlm() → trackGeminiUsage() → generationCostLog.mjs (JSONL).
 * flushCostForPart() persists per-part outcome (imported from generate-lesen-part-gemini.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { ROOT } from './loadEnv.mjs';
import {
  trackGenerationCostPending,
  flushGenerationCostLog,
} from './generationCostLog.mjs';
import { extractJson } from './extractJson.mjs';
import { resolveMaxOutputTokens, isLikelyTruncated } from './genOutputTokens.mjs';
import { buildExamPrompt, isSprechenPerTeil, isSchreibenPerTeil } from './examTemplatePrompt.mjs';
import { pickNextHorenT2Opening } from './horenOpeningsBank.mjs';
import {
  pickNextHorenT2ActivitySchedule,
  loadPersistedHorenT2KeySignatures,
} from './horenT2ActivityScheduleBank.mjs';
import {
  pickDialogueNameCast,
  recordDialogueCastsFromGeneration,
  extractDialogueCastSignature,
  loadPersistedDialogueCasts,
  validateA2HorenDialogueNames,
} from './dialogueNamesBank.mjs';
import { resolveGenerationFeedbackRules } from './resolveGenerationFeedback.mjs';
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
import { applyGermanCapsNormalize } from './germanCapsNormalize.mjs';
import { nextExamOutputBasename } from './pasteExamBatchLib.mjs';
import { validatePart, buildDedupCorpusFromDir } from './partGate.mjs';
import { assertSprechenPremiseUnique } from './sprechenPremiseDedup.mjs';
import { assertSchreibenT3PremiseUnique } from './schreibenT3PremiseDedup.mjs';
import { assertHorenPremiseUnique } from './horenPremiseDedup.mjs';
import { pickNextSchreibenT3Surname } from './schreibenT3NamesBank.mjs';
import { assertSchreibenNoPlaceholders } from './schreibenPlaceholderGate.mjs';
import { assertSprechenPerspectiveClean } from './sprechenPerspectiveGate.mjs';
import { checkLexical, formatLexicalReport } from './lexicalCheck.mjs';
import { classifyAndRepair } from './repairTriage.mjs';
import {
  collectCalidadLexicoIssues,
  combinedCalidadLexicoGateResult,
  COMBINED_CALIDAD_LEXICO_ISSUE_LIMIT,
} from './calidadLexicoCombinedGate.mjs';
import { isHorenCombinedCalidadLexicoTeil } from './horenCombinedCalidadLexico.mjs';
import {
  incrementPartFileFixIteration,
  initPartFileTracker,
  logPartFileOutcome,
  PartFileBrakeError,
  DEFAULT_MAX_ATTEMPTS_PER_FILE,
  DEFAULT_MAX_COST_PER_FILE_USD,
} from './partFileBrake.mjs';
import { runSurgicalRepair, surgicalRepairLabel } from './surgicalRepairRouter.mjs';
import { tagBatchWithTopic, alignQuestionTopicTagsToRequestedTopic } from './topicRotation.mjs';
import {
  pickNextNames,
  injectNamesIntoPrompt,
  pushSessionNameExclude,
  TEMPLATE_DEFAULT_NAMES,
} from './nameRotation.mjs';
import { resolveGenerationVocab, resolveTargetWordsForArgs, resolveGenerationTopic } from './resolveGenerationInput.mjs';
import { attachVocabFeedback, formatVocabFeedbackSummary } from './generationFeedback.mjs';
import { buildVocabBgMandatoryAnchorBlock } from './userVocabPrompt.mjs';
import { runQ4PipelineGate, runQ3PipelineGate, runLanguageToolPipelineAdvisory } from './qualityGates/pipelineIntegration.mjs';
import { runGermanContentLanguageGate } from './qualityGates/germanContentLanguageGate.mjs';
import { germanExamRepairOutputRulesBlock } from './germanExplanationPromptRules.mjs';
import { DailyQuotaError } from './geminiClient.mjs';
import {
  ApiBudgetStopError,
  RateLimitStopError,
  callLlm,
  usesApiBudget,
  budgetRemaining,
  flushCostForPart,
  MIN_PAUSE_MS,
  DEFAULT_WORD_COUNT,
  resolveLesenProvider,
  resolveProviderModel,
} from '../generate-lesen-part-gemini.mjs';
import { finalizePoolReady } from './finalizePoolReady.mjs';
import { relPathAfterPoolReady } from './resolvePublishFile.mjs';

export { DailyQuotaError, ApiBudgetStopError, RateLimitStopError, trackGenerationCostPending, flushGenerationCostLog };

import {
  GENERATED_DIR,
  generatedDir,
  ensureLevelStagingDirs,
} from './batchPaths.mjs';

function genDirFor(args) {
  const d = generatedDir(args?.level || 'B1');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
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
    maxAttemptsPerFile: DEFAULT_MAX_ATTEMPTS_PER_FILE,
    maxCostPerFileUsd: DEFAULT_MAX_COST_PER_FILE_USD,
    keepFailed: false,
    saveRaw: false,
    topic: null,
    skipPoolReady: false,
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
    else if (a === '--skip-pool-ready') out.skipPoolReady = true;
    else if (a === '--api-retries') out.apiRetries = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--fix-retries') out.fixRetries = Math.max(0, Number(argv[++i]) || 0);
    else if (a === '--provider') out.provider = String(argv[++i] || '').toLowerCase();
    else if (a === '--pause-ms') out.pauseMs = Math.max(MIN_PAUSE_MS, Number(argv[++i]) || MIN_PAUSE_MS);
    else if (a === '--model') out.model = String(argv[++i] || '').trim();
    else if (a === '--max-api-calls') out.maxApiCalls = Math.max(1, Number(argv[++i]) || 200);
    else if (a === '--max-attempts-per-file') {
      out.maxAttemptsPerFile = Math.max(1, Number(argv[++i]) || DEFAULT_MAX_ATTEMPTS_PER_FILE);
    } else if (a === '--max-cost-per-file') {
      out.maxCostPerFileUsd = Math.max(0.01, Number(argv[++i]) || DEFAULT_MAX_COST_PER_FILE_USD);
    } else if (a === '--keep-failed') out.keepFailed = true;
    else if (a === '--save-raw') out.saveRaw = true;
    else if (a === '--topic') out.topic = String(argv[++i] || '').trim();
  }

  out.pauseMs = Math.max(MIN_PAUSE_MS, out.pauseMs);
  if (!out.module || !SUPPORTED_MODULES.has(out.module)) {
    throw new Error('Indica --module horen|schreiben|sprechen');
  }
  return out;
}

export function summaryKey(module, teil, level = 'B1') {
  if (isSprechenPerTeil(module, level) || isSchreibenPerTeil(module, level)) return `T${teil}`;
  if (module === 'schreiben' || module === 'sprechen') return module;
  return `T${teil}`;
}

export function teileToRunExam(args) {
  const mod = args.module;
  const lv = String(args.level || 'B1').trim().toUpperCase();
  if (mod === 'horen') {
    if (args.teileList?.length) return [...new Set(args.teileList)].sort((a, b) => a - b);
    if (args.allTeile) return [1, 2, 3, 4];
    if (Number.isFinite(args.teil) && args.teil >= 1 && args.teil <= 4) return [args.teil];
    throw new Error('Hören: indica --teil 1..4, --teile 1,2,3 o --all-teile');
  }
  if (mod === 'sprechen' && (lv === 'A2' || lv === 'B2')) {
    const max = lv === 'B2' ? 2 : 3;
    if (args.teileList?.length) return [...new Set(args.teileList)].sort((a, b) => a - b);
    if (args.allTeile) return lv === 'B2' ? [1, 2] : [1, 2, 3];
    if (Number.isFinite(args.teil) && args.teil >= 1 && args.teil <= max) return [args.teil];
    throw new Error(`Sprechen ${lv}: indica --teil 1..${max}, --teile o --all-teile`);
  }
  if (mod === 'schreiben' && (lv === 'A2' || lv === 'B2')) {
    if (args.teileList?.length) return [...new Set(args.teileList)].sort((a, b) => a - b);
    if (args.allTeile) return [1, 2];
    if (Number.isFinite(args.teil) && args.teil >= 1 && args.teil <= 2) return [args.teil];
    throw new Error(`Schreiben ${lv}: indica --teil 1..2, --teile 1,2 o --all-teile`);
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

const HOREN_MCQ_TEILE_B1 = new Set([1, 2]);
const HOREN_T4_TEILE = new Set([4]);

function isHorenMcqTeil(module, teil, level) {
  if (String(module || '').toLowerCase() !== 'horen') return false;
  const t = Number(teil);
  const lv = String(level || 'B1').toUpperCase();
  if (lv === 'A2') return t === 1 || t === 3;
  return HOREN_MCQ_TEILE_B1.has(t);
}

const HOREN_T12_ANTI_B2 =
  '\nANTI-B2+: vocabulario B1 en preguntas, opciones y explicaciones; sin terminos B2+ (usa sinonimos mas simples).';

const HOREN_A2_MCQ_ANTI_LEVEL =
  '\nANTI-NIVEL: vocabulario A2 en preguntas y opciones; sin términos B1+/B2+ (usa palabras más simples).';

const HOREN_A2_T4_ANTI_LENGTH =
  '\nANTI-LONGITUD A2: entrevista radio 150–250 palabras, tono hablado sencillo (no debate largo).';

const HOREN_A2_T4_ANTI_COPY =
  '\nANTI-COPIA: parafrasea afirmaciones Ja/Nein; no copies >=4 palabras seguidas del audio.';

const HOREN_T12_ANTI_COPY =
  '\nANTI WORD-MATCHING: parafrasea preguntas/opciones; no copies >=4 palabras seguidas del audio.';

const HOREN_T4_ANTI_LENGTH =
  '\nANTI-LONGITUD: transcripcion max 450 palabras, 12-14 turnos de dialogo (no mas).';

const HOREN_T4_ANTI_COPY =
  '\nANTI-COPIA: parafrasea afirmaciones y preguntas; no copies >=4 palabras seguidas del audio.';

const HOREN_T4_TOPIC_AVOID = Object.freeze({
  Wohnen: 'Freizeit, Ausflug, Urlaub, Hobby, Wochenende',
  Freizeit: 'Wohnen, Miete, Umzug, Vermieter',
  Umwelt: 'Freizeit, Urlaub, Hobby sin enlace ecologico',
  Arbeit: 'Freizeit, Urlaub, Hobby',
  Ernährung: 'Freizeit, Sport, Reisen',
  Reisen: 'Wohnen, Arbeit, Bildung',
});

function buildHorenT4TopicAnchor(topicTag) {
  const topic = String(topicTag || 'el tema pedido').trim();
  const avoid = HOREN_T4_TOPIC_AVOID[topic] || 'temas ajenos al debate pedido';
  return `\nANCLA TEMATICA: debate sobre ${topic}; NO centres en ${avoid}.`;
}

export function buildExamFixNote(issues, gate, module, teil, topicTag = null, level = 'B1') {
  const mod = String(module || '').toLowerCase();
  const t = Number(teil);
  const lv = String(level || 'B1').trim().toUpperCase();
  const horenCombinedTeil = mod === 'horen' && isHorenCombinedCalidadLexicoTeil(t, lv);
  const horenT4Teil = mod === 'horen' && HOREN_T4_TEILE.has(t);
  const issueLimit = horenCombinedTeil ? COMBINED_CALIDAD_LEXICO_ISSUE_LIMIT : 6;
  const list = (Array.isArray(issues) ? issues : [issues]).filter(Boolean).slice(0, issueLimit);
  let extra = '';
  const horenMcqTeil = isHorenMcqTeil(mod, t, lv);

  if (horenT4Teil) {
    if (lv === 'A2') {
      extra = HOREN_A2_T4_ANTI_LENGTH + HOREN_A2_T4_ANTI_COPY;
      if (
        list.some((i) => /vocabulario B2|B2\+|C1\/C2|B1\+/i.test(String(i))) ||
        gate === 'lexico' ||
        gate === 'calidad+lexico'
      ) {
        extra += HOREN_A2_MCQ_ANTI_LEVEL;
      }
    } else {
      extra = HOREN_T4_ANTI_LENGTH + HOREN_T4_ANTI_COPY + buildHorenT4TopicAnchor(topicTag);
      if (
        list.some((i) => /vocabulario B2|B2\+|C1\/C2|zugänglich|Perspektiven/i.test(String(i))) ||
        gate === 'lexico' ||
        gate === 'calidad+lexico'
      ) {
        extra += HOREN_T12_ANTI_B2;
      }
      if (list.some((i) => /chrono|slot order|precedes|Wer sagt/i.test(String(i)))) {
        extra +=
          '\nCRONOLOGIA T4: el orden de turnos «Nombre:» en passages[0].text DEBE coincidir con el orden ' +
          'de aparición en el audio (slot 1→8). No reordenes respuestas: cada pregunta Zuordnung referencia ' +
          'la afirmación en la posición temporal correcta del diálogo.';
      }
    }
  } else if (horenMcqTeil) {
    extra =
      lv === 'A2' ? HOREN_A2_MCQ_ANTI_LEVEL + HOREN_T12_ANTI_COPY : HOREN_T12_ANTI_B2 + HOREN_T12_ANTI_COPY;
  } else if (horenCombinedTeil) {
    extra = lv === 'A2' ? HOREN_A2_MCQ_ANTI_LEVEL : HOREN_T12_ANTI_B2;
    if (list.some((i) => /copia|literal|word-matching|comparten/i.test(String(i)))) {
      extra += HOREN_T12_ANTI_COPY;
    }
  } else if (list.some((i) => /copia|literal|word-matching|comparten/i.test(String(i)))) {
    extra =
      '\nANTI WORD-MATCHING: parafrasea preguntas/opciones; no copies >=4 palabras seguidas del audio.';
  }
  if (list.some((i) => /sesgo de longitud MCQ/i.test(String(i)))) {
    extra +=
      '\nANTI-ATAJO LONGITUD: la opción correcta NO puede ser la más larga. ' +
      'Acorta la correcta o alarga distractores hasta longitud comparable (mismo detalle B1).';
  }
  if (
    mod === 'lesen' &&
    t === 4 &&
    list.some((i) => /demasiado corto|mín 25|signText/i.test(String(i)))
  ) {
    extra +=
      '\nLesen T4 signText: cada opinión del foro ≥25 palabras (ideal 30–45), postura clara Ja/Nein al inicio, ' +
      'sin copiar literalmente la pregunta del foro.';
  }
  if (
    mod === 'horen' &&
    t === 2 &&
    lv === 'A2' &&
    list.some((i) =>
      /Was macht|enunciado debe|clave.*no coincide|actividad.*no mapea|hablante.*no aparece|faltan Montag|picture/i.test(
        String(i),
      ),
    )
  ) {
    extra +=
      '\nHören A2 T2 picture-matching: enunciado «Was macht {Name} am {Montag|…|Freitag}?»; ' +
      'banco estándar a–i (Fahrrad, Deutschkurs, Freunde treffen, Sport, Museum, Kino, Lernen, Einkaufen, Kochen); ' +
      'correct = actividad que ESE hablante dice hacer ESE día en el diálogo; 5 letras distintas; sin options.';
  }
  if (
    mod === 'horen' &&
    t === 3 &&
    lv === 'A2' &&
    list.some((i) => /options_missing|type_not_allowed|richtig_falsch|ja_nein/i.test(String(i)))
  ) {
    extra +=
      '\nHören A2 T3→5 segmentos cortos (s1–s5, 15–50 Wörter c/u) + 5× multiple_choice a/b/c. ' +
      'Cada question: segmentLabel «Text 1»…«Text 5», options con 3 strings «a) …», «b) …», «c) …». ' +
      'PROHIBIDO: 1 diálogo largo + 7 Richtig/Falsch (formato B1) u options: []. level:"A2".';
  }

  if (mod === 'horen' && list.some((i) => /dialogo|turnos|Person A/i.test(String(i)))) {
    extra += '\nUsa turnos «Nombre:» alternados en transcripciones de dialogo/discusion.';
  }
  if ((mod === 'schreiben' || mod === 'sprechen') && list.some((i) => /Wörter|argument|Sie|planen/i.test(String(i)))) {
    extra += '\nRevisa la rubrica Goethe: longitud, registro, puntos/bullets pedidos en la consigna.';
  }
  if (mod === 'sprechen' && list.some((i) => /Sprechen T2/i.test(String(i)))) {
    extra +=
      '\nT2: incluye «Halten Sie eine kurze Präsentation zum Thema „…“» + 5 puntos numerados 1.–5. ' +
      '(Einleitung, Erfahrung, Details, Vor- und Nachteile, Meinung/Schluss). ' +
      'Cada question debe tener "teil":1|2|3 correcto.';
  }
  if (mod === 'sprechen' && list.some((i) => /Sprechen T3/i.test(String(i)))) {
    extra +=
      '\nT3: «Geben Sie … konstruktives Feedback» + «Stellen Sie 2-3 Fragen» + bloque «Beispielfragen:». ' +
      'Referencia la Präsentation de Teil 2. "teil":3 en la question.';
  }
  if (mod === 'sprechen' && list.some((i) => /JSON|questions/i.test(String(i)))) {
    extra +=
      '\nDevuelve JSON completo: { "passages": [], "questions": [ exactly 3 objects with teil 1,2,3 ] }. Sin markdown.';
  }
  return (
    `\n\n--- CORRECCION REQUERIDA ---\n` +
    `El checker de ${gate} detecto (${list.length} problema(s)):\n${list.map((i) => `- ${i}`).join('\n')}${extra}\n` +
    (horenCombinedTeil
      ? horenT4Teil
        ? `Corrige TODOS los problemas listados en una sola respuesta (cronología, longitud, copia y vocabulario B1).\n`
        : `Corrige TODOS los problemas listados en una sola respuesta (copia, calidad MCQ y vocabulario B1).\n`
      : '') +
    `Corrige SOLO esos problemas. Devuelve el JSON completo corregido, sin markdown ni comentarios.` +
    `\n\n${germanExamRepairOutputRulesBlock()}`
  );
}

function runModuleQuality(batch, args, teil) {
  const mod = args.module;
  if (mod === 'horen') {
    const quality = checkHorenBatchQuality(batch, teil, { level: args.level });
    return {
      ok: quality.ok,
      issues: quality.issues || [],
      report: formatHorenQualityReport(quality, teil),
    };
  }
  const issues = [];
  const reports = [];
  const teile =
    (isSprechenPerTeil(mod, args.level) || isSchreibenPerTeil(mod, args.level)) && teil != null
      ? [Number(teil)]
      : [1, 2, 3];
  for (const t of teile) {
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

  // Post-gen caps + markdown strip (mismo stack que Lesen). normalizeBatch ya lo
  // aplica una vez; re-pass decapOnly refuerza antes de gates (Hören T1 markdown leak).
  // Schreiben: mismo cableado (decapOnly) — evita over-caps en consignas/rúbricas.
  if (args.module === 'horen' || args.module === 'schreiben' || args.module === 'sprechen') {
    batch = applyGermanCapsNormalize(batch, { decapOnly: true, log: true }).batch;
  }

  // Q5 — deterministic German content language (hard block for lang:de)
  if (String(args.lang || 'de').toLowerCase() === 'de' && !args.skipQualityGates && !args.dryRun) {
    const q5 = runGermanContentLanguageGate(batch, { file: relFile.replace(/\\/g, '/'), lang: 'de' });
    if (q5.verdict === 'block') {
      const issue = q5.findings?.[0]?.detail || 'non_german_exam_text';
      console.log(`  [Q5 block] ${q5.findings.length} non-German text hit(s):`);
      for (const f of q5.findings.slice(0, 5)) console.log(`    · ${f.detail}`);
      return {
        ok: false,
        gate: 'idioma',
        issue,
        issues: (q5.findings || []).map((f) => f.detail).slice(0, 5),
      };
    }
  }

  // Q4 metadataSchema — Hören en audit-only (hardBlock=false); no rechaza todavía.
  if (args.module === 'horen' && !args.skipQualityGates && !args.dryRun) {
    const lv = String(args.level || batch.level || 'B1').toUpperCase();
    const t = Number(teil ?? batch.teil ?? batch.passages?.[0]?.teil);
    if (lv === 'A2' && [1, 2, 3].includes(t)) {
      const dn = validateA2HorenDialogueNames(batch, {
        teil: t,
        plannedPairs: args._dialogueNamePairs || [],
      });
      if (!dn.ok) {
        const issue = dn.issues[0] || 'dialogue_names_mismatch';
        console.log(`  [dialogue-names block] ${dn.issues.length} issue(s):`);
        for (const line of dn.issues.slice(0, 6)) console.log(`    · ${line}`);
        return {
          ok: false,
          gate: 'dialogue-names',
          issue,
          issues: dn.issues.slice(0, 6),
        };
      }
    }

    alignQuestionTopicTagsToRequestedTopic(batch);
    const q4 = runQ4PipelineGate(batch, {
      file: relFile.replace(/\\/g, '/'),
      profile: 'generated',
      module: 'horen',
      hardBlock: false,
    });
    const mismatches = q4.verdict.findings.filter((f) => f.rule === 'topic_mismatch');
    if (mismatches.length) {
      console.log(`  [Q4 audit-only] ${mismatches.length} topic_mismatch (no block):`);
      for (const f of mismatches.slice(0, 5)) console.log(`    · ${f.detail}`);
    } else if (q4.verdict.findings.length) {
      console.log(`  [Q4 audit-only] ${q4.verdict.verdict}: ${q4.verdict.findings.length} finding(s)`);
    }

    // Q3 text deterministic (incl. dateWeekday) — audit-only, mismo modo que Lesen.
    const q3 = runQ3PipelineGate(batch, { file: relFile.replace(/\\/g, '/') });
    const dateHits = (q3.verdict.findings || []).filter((f) => f.rule === 'date_weekday_mismatch');
    if (dateHits.length) {
      console.log(`  [Q3 audit-only] date_weekday_mismatch ×${dateHits.length}:`);
      for (const f of dateHits.slice(0, 5)) console.log(`    · ${f.detail}`);
    }

    // LanguageTool advisory — never blocks; soft-skip if Docker LT is down.
    if (!args.skipLanguageTool) {
      await runLanguageToolPipelineAdvisory(batch, {
        file: relFile.replace(/\\/g, '/'),
      });
    }
  }

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
    const isHorenCombined =
      args.module === 'horen' && isHorenCombinedCalidadLexicoTeil(teil, args.level);
    const quality = runModuleQuality(batch, args, teil);
    console.log(quality.report);

    if (isHorenCombined) {
      const combined = collectCalidadLexicoIssues(batch, quality, {
        level: args.level,
      });
      if (!combined.ok) {
        if (combined.lexIssues.length) console.log(formatLexicalReport(combined.lex));
        console.log(
          `  [Hören T${teil} combined] ${combined.issues.length} issue(s) ` +
            `(calidad ${combined.calidadIssues.length}, léxico ${combined.lexIssues.length})`,
        );
        for (const line of combined.issues.slice(0, COMBINED_CALIDAD_LEXICO_ISSUE_LIMIT)) {
          console.log(`    · ${line}`);
        }
        unlinkTmp();
        return combinedCalidadLexicoGateResult(combined, { label: `horen-t${teil}` });
      }
      if (combined.lex.warnings?.length) console.log(formatLexicalReport(combined.lex));
    } else {
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

      const lex = checkLexical(batch, { level: args.level });
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
  }

  // Hören premise dedup — always on (independent of skipQuality); selftest must not bypass this.
  if (args.module === 'horen' && !args.skipDedup && [1, 2].includes(Number(teil))) {
    const hprem = assertHorenPremiseUnique(batch, teil, {
      selfSource: relFile.replace(/\\/g, '/'),
    });
    if (!hprem.ok) {
      console.log(`Hören T${teil} premise-dedup FAIL: ${hprem.issue}`);
      unlinkTmp();
      return {
        ok: false,
        gate: 'dedup',
        issue: hprem.issue,
        issues: [hprem.issue],
        detail: hprem.issue,
      };
    }
  }

  if (!args.skipQuality) {
    let dedupCorpus = null;
    if (!args.skipDedup) {
      try {
        const currentIds = new Set((batch.passages || []).map((p) => p.id).filter(Boolean));
        dedupCorpus = buildDedupCorpusFromDir(genDirFor(args), fs, path)
          .filter((e) => !currentIds.has(e.id));
      } catch (e) {
        console.warn(`  ⚠ dedup corpus omitido: ${e.message}`);
      }
    }

    if (args.module === 'schreiben') {
      const ph = assertSchreibenNoPlaceholders(batch);
      if (!ph.ok) {
        console.log(`Schreiben placeholder FAIL: ${ph.issues[0]}`);
        unlinkTmp();
        return {
          ok: false,
          gate: 'calidad',
          issue: ph.issues[0],
          issues: ph.issues,
          detail: ph.issues.join('\n'),
        };
      }
    }

    if (args.module === 'schreiben' && !args.skipDedup) {
      const t3prem = assertSchreibenT3PremiseUnique(batch, {
        selfSource: relFile.replace(/\\/g, '/'),
      });
      if (!t3prem.ok) {
        console.log(`Schreiben T3 premise-dedup FAIL: ${t3prem.issue}`);
        unlinkTmp();
        return {
          ok: false,
          gate: 'dedup',
          issue: t3prem.issue,
          issues: [t3prem.issue],
          detail: t3prem.issue,
        };
      }
    }

    // SP-2.4: Sprechen set fingerprint (T1 premise + T2 topic) — block on exact match
    if (args.module === 'sprechen' && !args.skipDedup) {
      const prem = assertSprechenPremiseUnique(batch, {
        selfSource: relFile.replace(/\\/g, '/'),
      });
      if (!prem.ok) {
        console.log(`Sprechen premise-dedup FAIL: ${prem.issue}`);
        unlinkTmp();
        return {
          ok: false,
          gate: 'dedup',
          issue: prem.issue,
          issues: [prem.issue],
          detail: prem.issue,
        };
      }
    }

    // SP perspective: T3 must not use examiner 1st person / Kandidat* (Partner/Partnerin only)
    if (args.module === 'sprechen') {
      const persp = assertSprechenPerspectiveClean(batch);
      if (!persp.ok) {
        console.log(`Sprechen perspective FAIL: ${persp.issue}`);
        unlinkTmp();
        return {
          ok: false,
          gate: 'sprechen_perspective',
          issue: persp.issue,
          issues: [persp.issue],
          detail: persp.issue,
        };
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

async function buildExamPromptBundle(module, teil, words, session, args = null) {
  const idSuffix = randomBytes(4).toString('hex');
  const level = args?.level || 'B1';
  const promptTeil =
    module === 'horen' || isSprechenPerTeil(module, level) || isSchreibenPerTeil(module, level)
      ? teil
      : 1;
  const topic = args?._resolvedTopic || args?.topic || null;
  let horenT2Opening = null;
  let horenT2ActivitySchedule = null;
  let dialogueNamePairs = null;
  const lv = String(level).toUpperCase();

  if (module === 'horen' && Number(teil) === 2) {
    if (!args._horenT2UsedOpenings) args._horenT2UsedOpenings = new Set();
    const pick = pickNextHorenT2Opening(args._horenT2UsedOpenings, `${topic}:${Date.now()}`, topic);
    horenT2Opening = pick.opening;
    if (horenT2Opening) args._horenT2UsedOpenings.add(horenT2Opening);
    console.log(`Hören T2 apertura rotada: «${horenT2Opening}…»`);

    if (lv === 'A2') {
      if (!args._horenT2UsedSchedules) args._horenT2UsedSchedules = new Set();
      const exclude = loadPersistedHorenT2KeySignatures(lv);
      for (const s of args._horenT2UsedSchedules) exclude.add(s);
      const schPick = pickNextHorenT2ActivitySchedule(exclude, `${topic}:sched:${Date.now()}`);
      horenT2ActivitySchedule = schPick.schedule;
      if (horenT2ActivitySchedule) {
        args._horenT2UsedSchedules.add(horenT2ActivitySchedule.id);
        args._horenT2UsedSchedules.add(horenT2ActivitySchedule.correctKeys.join('-'));
        console.log(`Hören T2 plan semanal: ${horenT2ActivitySchedule.id} [${horenT2ActivitySchedule.correctKeys.join(',')}]`);
      }
      const namePick = pickDialogueNameCast(1, {
        level: lv,
        module: 'horen',
        teil: 2,
        entropy: `${topic}:t2names:${Date.now()}`,
        excludeCasts: loadPersistedDialogueCasts({ level: lv, module: 'horen', teil: 2 }).casts,
        sessionExcludeCasts: args._dialogueCastSessionExclude || (args._dialogueCastSessionExclude = new Set()),
      });
      dialogueNamePairs = namePick.pairs;
      args._dialogueCastSignature = namePick.castSignature;
      args._dialogueNamePairs = namePick.pairs;
      console.log(`Hören T2 nombres: ${dialogueNamePairs.map((p) => p.join('/')).join(', ')}`);
    }
  }

  if (module === 'horen' && (Number(teil) === 3 || Number(teil) === 1) && lv === 'A2') {
    const count = Number(teil) === 3 ? 5 : 5;
    if (!args._dialogueCastSessionExclude) args._dialogueCastSessionExclude = new Set();
    const namePick = pickDialogueNameCast(count, {
      level: lv,
      module: 'horen',
      teil: Number(teil),
      entropy: `${topic}:t${teil}names:${Date.now()}`,
      excludeCasts: loadPersistedDialogueCasts({ level: lv, module: 'horen', teil: Number(teil) }).casts,
      sessionExcludeCasts: args._dialogueCastSessionExclude,
    });
    dialogueNamePairs = namePick.pairs;
    args._dialogueCastSignature = namePick.castSignature;
    args._dialogueNamePairs = namePick.pairs;
    args._dialogueCastSessionExclude.add(namePick.castSignature);
    if (dialogueNamePairs.length < count) {
      throw new Error(
        `Hören T${teil}: solo ${dialogueNamePairs.length}/${count} pares en banco (sin Emma+Jonas/Clara+Tobias).`,
      );
    }
    console.log(`Hören T${teil} elenco (${count} pares): ${dialogueNamePairs.map((p) => p.join('+')).join(' · ')}`);
  }
  const feedbackMetaOut = {};
  let feedbackRules = [];
  try {
    feedbackRules = await resolveGenerationFeedbackRules({
      module,
      level: args?.level || 'B1',
      topic: topic || undefined,
      teil:
        module === 'horen' || isSprechenPerTeil(module, args?.level) || isSchreibenPerTeil(module, args?.level)
          ? Number(teil)
          : undefined,
      lang: args?.lang || 'de',
      enabled: args?.generationFeedbackEnabled,
      feedbackMode: args?.feedbackMode,
      maxRules: args?.maxFeedbackRules,
      feedbackRules: args?.feedbackRules,
      feedback: args?.feedback,
      store: args?.feedbackStore,
    });
  } catch (_) {
    feedbackRules = [];
  }
  let fullPrompt = buildExamPrompt(module, promptTeil, words, {
    idSuffix,
    topic,
    level: args?.level || 'B1',
    schreibenT3Surname: args?._schreibenT3Surname || null,
    horenT2Opening,
    horenT2ActivitySchedule,
    dialogueNamePairs,
    feedbackRules,
    generationFeedbackEnabled: args?.generationFeedbackEnabled,
    feedbackMode: args?.feedbackMode,
    maxFeedbackRules: args?.maxFeedbackRules,
    feedbackMetaOut,
  });
  if (args?.vocabBgStrictAnchor?.length) {
    const block = buildVocabBgMandatoryAnchorBlock(args.vocabBgStrictAnchor, topic, {
      horen: module === 'horen',
    });
    if (block) fullPrompt = `${fullPrompt}\n\n${block}`;
  }
  if (feedbackMetaOut.feedbackRulesApplied > 0) {
    console.log(
      `[generationFeedback] mode=${feedbackMetaOut.feedbackMode || '?'} feedbackRulesApplied: ${feedbackMetaOut.feedbackRulesApplied}`,
    );
  }
  return {
    idSuffix,
    fullPrompt,
    systemPrompt: null,
    userPrompt: fullPrompt,
    generationMetadata: {
      usedFeedback: !!feedbackMetaOut.usedFeedback,
      feedbackRules: feedbackMetaOut.feedbackRules || [],
      feedbackCount: feedbackMetaOut.feedbackCount || 0,
      feedbackCategories: feedbackMetaOut.feedbackCategories || [],
      feedbackMode: feedbackMetaOut.feedbackMode || 'off',
      feedbackVersion: feedbackMetaOut.feedbackVersion || 'v1',
    },
  };
}

function finalizeSaved(args, module, teil, batch, relFile) {
  const teilLabel = teil != null ? `Teil ${teil}` : 'Teile 1–3';
  const lv = String(args?.level || batch?.level || 'B1').toUpperCase();
  if (module === 'horen' && lv === 'A2' && [1, 2, 3].includes(Number(teil))) {
    recordDialogueCastsFromGeneration({
      level: lv,
      module,
      teil: Number(teil),
      batch,
      plannedSignature: args?._dialogueCastSignature || null,
    });
  }
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
  const gDir = genDirFor(args);
  ensureLevelStagingDirs(args?.level || 'B1');

  const chosenTopic = args._resolvedTopic || resolveGenerationTopic(args, { module, teil });
  console.log(`Tema: ${chosenTopic}${args.topic ? ' (elegido)' : ' (rotación)'}`);
  args._resolvedTopic = chosenTopic;

  const settleCostOk = (file) =>
    flushCostForPart(session, args, {
      ok: true,
      file,
      module,
      teil,
      topic: chosenTopic,
    });
  const settleCostFail = (reason, gate = null) =>
    flushCostForPart(session, args, {
      ok: false,
      failReason: reason,
      failGate: gate,
      module,
      teil,
      topic: chosenTopic,
    });

  // AUD-5: Hören T4 — rotación de nombres (evitar Dana/Florian de plantilla)
  let chosenNames = null;
  if (module === 'horen' && Number(teil) === 4) {
    chosenNames = pickNextNames(gDir, 2, {
      module: 'horen',
      teil: 4,
      sessionExclude: args._excludeNames || [],
      avoidTemplateDefaults: true,
    });
    pushSessionNameExclude(args, chosenNames);
    console.log(`Nombres invitados: ${chosenNames.join(' / ')} (rotación AUD-5)`);
  }

  if (module === 'schreiben' && String(args.level || 'B1').trim().toUpperCase() === 'B1') {
    args._schreibenT3Surname = pickNextSchreibenT3Surname(gDir);
    console.log(`Nachbar Schreiben T3: Herr/Frau ${args._schreibenT3Surname} (rotación apellidos)`);
  }

  let promptBundle = await buildExamPromptBundle(module, teil, words, session, args);
  if (chosenNames) {
    const nameOpts = {
      useNames: chosenNames,
      avoidNames: [...(args._excludeNames || []), ...TEMPLATE_DEFAULT_NAMES],
    };
    promptBundle = {
      ...promptBundle,
      userPrompt: injectNamesIntoPrompt(promptBundle.userPrompt, nameOpts),
      fullPrompt: promptBundle.fullPrompt
        ? injectNamesIntoPrompt(promptBundle.fullPrompt, nameOpts)
        : promptBundle.fullPrompt,
    };
  }
  let prompt = promptBundle.userPrompt;
  let baseUserPrompt = prompt;

  const resetPromptWithFix = (issues, gate) => {
    const note = buildExamFixNote(issues, gate, module, teil, chosenTopic, args.level);
    prompt = baseUserPrompt + note;
  };

  const tokenTeil = teil ?? 1;
  const resolveMaxTokens = () => resolveMaxOutputTokens(session.provider, module, tokenTeil);

  const basename = nextExamOutputBasename(module, teil, tag, args.level);
  const outFile = path.join(gDir, basename);
  const relFile = path.relative(ROOT, outFile).replace(/\\/g, '/');
  let maxTokens = resolveMaxTokens();

  const key = summaryKey(module, teil);
  const teilLabel = teil != null ? `T${teil}` : module;
  console.log(`\n── ${module} ${teilLabel} · ${basename} ──`);
  console.log(`Proveedor: ${session.provider} · Palabras (${words.length}): ${words.join(', ')}`);
  console.log(`Modelo: ${session.model} · max_output_tokens=${maxTokens}`);

  initPartFileTracker(session, args, { relFile });

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

  const finishPart = (result) => {
    logPartFileOutcome(session, {
      ok: result.ok,
      braked: result.braked,
      reason: result.reason,
    });
    return result;
  };

  const handlePartBrake = (err) => {
    console.warn(`\n⛔ ${err.message}`);
    console.warn('   → Se abandona este archivo; el lote/celda continúa con el siguiente intento.');
    settleCostFail(err.message, 'part-brake');
    return finishPart({
      ok: false,
      discarded: true,
      braked: true,
      module,
      teil,
      key,
      reason: err.message,
      attempts: partAttempts,
      gate: 'part-brake',
    });
  };

  for (let fix = 0; fix <= args.fixRetries; fix++) {
    partAttempts += 1;
    incrementPartFileFixIteration(session);
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
        if (err instanceof PartFileBrakeError) {
          return handlePartBrake(err);
        }
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
        settleCostFail(lastApiError?.message || 'sin respuesta del modelo', 'api');
        resetPromptWithFix(lastApiError?.message || 'sin respuesta del modelo', 'generación');
        continue;
      }
      settleCostFail(lastApiError?.message || 'sin respuesta del modelo', 'api');
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
        settleCostFail(msg, 'truncation');
        // No se añade buildExamFixNote — el prompt no empeora la truncación
        continue;
      }
      settleCostFail(msg, 'truncation');
      return { ok: false, discarded: true, module, teil, key, reason: msg, attempts: partAttempts };
    }

    let batch;
    try {
      batch = extractJson(text);
    } catch (err) {
      lastIssue = err.message;
      if (fix < args.fixRetries) {
        settleCostFail(err.message, 'formato');
        resetPromptWithFix(err.message, 'formato');
        continue;
      }
      settleCostFail(err.message, 'formato');
      return { ok: false, discarded: true, module, teil, key, reason: err.message, attempts: partAttempts };
    }

    if (!batch || typeof batch !== 'object' || !Array.isArray(batch.questions)) {
      const msg = 'JSON raíz inválido (falta array questions)';
      lastIssue = msg;
      if (fix < args.fixRetries) {
        settleCostFail(msg, 'formato');
        resetPromptWithFix(msg, 'formato');
        continue;
      }
      settleCostFail(msg, 'formato');
      return { ok: false, discarded: true, module, teil, key, reason: msg, attempts: partAttempts };
    }

    if (args.saveRaw) {
      const rawBasename = basename.replace(/\.json$/i, '.raw.json');
      const rawPath = path.join(gDir, rawBasename);
      fs.mkdirSync(path.dirname(rawPath), { recursive: true });
      fs.writeFileSync(rawPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
      console.log(`  [save-raw] ${path.relative(ROOT, rawPath).replace(/\\/g, '/')}`);
    }

    batch = normalizeBatch(batch, {
      module,
      teil: teil ?? undefined,
      lang: args.lang,
      level: args.level,
      topicTag: chosenTopic,
      rootTopicTag: chosenTopic,
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
    if (promptBundle?.generationMetadata) {
      batch.generationMetadata = { ...promptBundle.generationMetadata };
    }
    if (args.testMode) {
      batch._operatorSelftest = {
        at: new Date().toISOString(),
        note: 'NO publicar en pool-verified — resultado de prueba operador (--selftest)',
        module,
        teil,
      };
    }
    lastBatch = batch;

    if (!args.skipValidate) console.log('Validando formato…');
    if (!args.skipQuality && fix === 0) console.log('Comprobando calidad pedagógica…');

    const gates = await runDualGates(args, teil, batch, relFile);
    if (gates.ok) {
      const absPath = path.join(ROOT, relFile);
      let finalBatch = gates.batch || batch;
      let publishRel = relFile;
      if (!args.dryRun && !args.skipPoolReady) {
        try {
          const promo = await finalizePoolReady(absPath, finalBatch, { level: args.level });
          publishRel = relPathAfterPoolReady(relFile, promo.poolPath);
          finalBatch = promo.verdict === 'READY' && promo.poolPath
            ? JSON.parse(fs.readFileSync(promo.poolPath, 'utf8'))
            : finalBatch;
        } catch (err) {
          console.warn(`  [poolReady] aviso: ${err.message}`);
        }
      }
      settleCostOk(publishRel);
      return finishPart({
        ...finalizeSaved(args, module, teil, finalBatch, publishRel),
        words,
        attempts: partAttempts,
        batch: finalBatch,
      });
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
        settleCostFail(discardReason, gates.gate || 'triage');
        return finishPart({
          ok: false,
          discarded: true,
          module,
          teil,
          key,
          reason: discardReason,
          attempts: partAttempts,
        });
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
          let publishRel = relFile;
          if (!args.dryRun && !args.skipPoolReady) {
            try {
              const absPath = path.join(ROOT, relFile);
              const promo = await finalizePoolReady(absPath, batch, { level: args.level });
              publishRel = relPathAfterPoolReady(relFile, promo.poolPath);
            } catch (err) {
              console.warn(`  [poolReady] aviso: ${err.message}`);
            }
          }
          settleCostOk(publishRel);
          return finishPart({
            ...finalizeSaved(args, module, teil, batch, publishRel),
            words,
            attempts: partAttempts,
            batch,
          });
        }

        // Parcialmente resuelto: actualizar gates con el estado post-reparación
        if (triage.partialOnly) {
          console.log(`  Triaje parcial → fallos residuales (${reGates.gate}), continúa con LLM`);
        }
        // Fall through with updated gates for normal LLM retry
        Object.assign(gates, reGates);
      } else if (triage.repaired === 'targeted' && triage.repairKind) {
        const label = surgicalRepairLabel(triage.repairKind, args.level);
        console.log(`  Triaje CUBO C (${label}) → reparación localizada (1 llamada LLM)…`);
        let repaired;
        try {
          repaired = await runSurgicalRepair(triage, batch, {
            teil,
            module,
            callLlm: (opts) => callLlm(session, args, opts),
            maxTokens,
            lang: args.lang,
            level: args.level,
            issues: gates.issues || [gates.issue || gates.reason].filter(Boolean),
          });
        } catch (err) {
          if (err instanceof PartFileBrakeError) return handlePartBrake(err);
          throw err;
        }
        if (repaired) {
          batch = repaired;
          lastBatch = batch;
        } else {
          console.log(`  Reparación ${triage.repairKind}: sin cambios en batch — re-validando estado actual…`);
        }
        console.log(`  Re-validando tras ${triage.repairKind}…`);
        const reGates = await runDualGates(args, teil, batch, relFile);
        if (reGates.ok) {
          console.log(`  Reparación ${triage.repairKind} OK → guardado sin regenerar parte`);
          const absPath = path.join(ROOT, relFile);
          let finalBatch = reGates.batch || batch;
          let publishRel = relFile;
          if (!args.dryRun && !args.skipPoolReady) {
            try {
              const promo = await finalizePoolReady(absPath, finalBatch, { level: args.level });
              publishRel = relPathAfterPoolReady(relFile, promo.poolPath);
              finalBatch = promo.verdict === 'READY' && promo.poolPath
                ? JSON.parse(fs.readFileSync(promo.poolPath, 'utf8'))
                : finalBatch;
            } catch (err) {
              console.warn(`  [poolReady] aviso: ${err.message}`);
            }
          }
          settleCostOk(publishRel);
          return finishPart({
            ...finalizeSaved(args, module, teil, finalBatch, publishRel),
            words,
            attempts: partAttempts,
            batch: finalBatch,
            localizedRepair: triage.repairKind,
          });
        }
        console.log(
          `  Reparación ${triage.repairKind} parcial → fallos residuales (${reGates.gate}), continúa con LLM`,
        );
        Object.assign(gates, reGates);
      }
      // Cubo C fallido o sin reparación → caída al reintento LLM normal
    }
    // ── Fin triaje ────────────────────────────────────────────────────────────

    lastIssue = gates.issue || gates.reason || 'checker';
    if (fix >= args.fixRetries) {
      console.error(gates.detail || lastIssue);
      if (args.keepFailed && lastBatch) {
        saveRejectedBatch(lastBatch, basename, lastIssue);
      }
      settleCostFail(lastIssue, gates.gate || 'checker');
      return finishPart({
        ok: false,
        discarded: true,
        module,
        teil,
        key,
        reason: lastIssue,
        issues: gates.issues,
        gate: gates.gate,
        attempts: partAttempts,
      });
    }

    const isQualityGate = /^(calidad|audit2|lexico|calidad\+lexico)$/.test(gates.gate || '');
    if (isQualityGate) {
      if (fix === 0 && args.fixRetries > 1) {
        console.log('Calidad FAIL → regeneración limpia en siguiente intento si persiste…');
      }
      if (fix < args.fixRetries) {
        qualityRetry = true;      // next iteration uses temperature 0.3
        scaledMaxTokens = null;   // release any token scaling from a prior truncation
      }
    }
    settleCostFail(lastIssue, gates.gate || 'checker');
    resetPromptWithFix(gates.issues || gates.issue || gates.reason, gates.gate || 'checker');
    if (module === 'horen' && isHorenMcqTeil(module, Number(teil), args.level)) {
      console.log(
        `  [fix-note] Hören T${teil} retry ${fix + 1}/${args.fixRetries}: dual hint (anti-B2+ + anti-copia)`,
      );
    }
    if (module === 'horen' && isHorenCombinedCalidadLexicoTeil(teil, args.level)) {
      const n = Array.isArray(gates.issues) ? gates.issues.length : 1;
      const lv = String(args.level || 'B1').trim().toUpperCase();
      const t4Extra =
        HOREN_T4_TEILE.has(Number(teil)) && lv === 'A2'
          ? 'entrevista A2 + copia'
          : HOREN_T4_TEILE.has(Number(teil))
            ? `longitud + copia + ancla ${chosenTopic}`
            : lv === 'A2'
              ? 'anti-A2 + anti-copia'
              : 'anti-B2+ + anti-copia';
      console.log(
        `  [fix-note] Hören T${teil} retry ${fix + 1}/${args.fixRetries}: combined (${n} issue(s); ${t4Extra}${gates.gate === 'calidad+lexico' ? ' + léxico' : ''})`,
      );
    }
  }

  settleCostFail(lastIssue || 'Generación fallida', 'checker');
  return finishPart({
    ok: false,
    discarded: true,
    module,
    teil,
    key,
    reason: lastIssue || 'Generación fallida',
    attempts: partAttempts,
  });
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
    maxAttemptsPerFile: opts.maxAttemptsPerFile ?? DEFAULT_MAX_ATTEMPTS_PER_FILE,
    maxCostPerFileUsd: opts.maxCostPerFileUsd ?? DEFAULT_MAX_COST_PER_FILE_USD,
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
  const runKeys = teile.map((t) => summaryKey(module, t, args.level));
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
  if (opts.vocabBgStrictAnchor?.length) {
    args.vocabBgStrictAnchor = [...opts.vocabBgStrictAnchor];
  }
  if (opts.skipQuality === true) args.skipQuality = true;
  if (opts.testMode === true) {
    args.testMode = true;
    args.skipPoolReady = true;
  }
  args.fixRetries = opts.fixRetries ?? args.fixRetries;
  if (opts.maxAttemptsPerFile != null) args.maxAttemptsPerFile = opts.maxAttemptsPerFile;
  if (opts.maxCostPerFileUsd != null) args.maxCostPerFileUsd = opts.maxCostPerFileUsd;

  try {
    const result = await generateExamPart(args, teil, session);
    const ms = Date.now() - t0;
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason || result.issue || 'generation_failed',
        braked: result.braked,
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

export async function runExamGenerator(argv = process.argv.slice(2), seedArgs = null) {
  const args = parseExamArgs(argv);
  if (seedArgs && typeof seedArgs === 'object') {
    for (const [k, v] of Object.entries(seedArgs)) {
      if (v !== undefined) args[k] = v;
    }
  }
  args.provider = await resolveLesenProvider(args.provider);
  // Mismo default que pool-fill / generate-cli (antes 0 = descuido: sin reintentos LLM en CLI directo).
  if (args.fixRetries == null) {
    args.fixRetries = 2;
  }

  const teile = teileToRunExam(args);
  const runKeys = teile.map((t) => summaryKey(args.module, t, args.level));
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
    args.module === 'horen' ||
    isSprechenPerTeil(args.module, args.level) ||
    isSchreibenPerTeil(args.module, args.level)
      ? teile.map((t) => `T${t}`).join(', ')
      : 'Teile 1–3';
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
