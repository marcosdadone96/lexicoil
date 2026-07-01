#!/usr/bin/env node
/**
 * Generate residual exam parts with Claude — one Teil at a time, strict gates.
 *
 *   node scripts/generate-residual-parts.mjs --lang de --level B1 [--dry-run]
 *   node scripts/generate-residual-parts.mjs --lang de --level B1 --apply [--yes]
 *
 * Reads docs/audit/b1-residual-gaps.json; fixes Lesen T3 correct:"0" (work/health/travel);
 * generates missing parts (e.g. Hören T2) via PromptBuilder + Claude.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateContent } from './lib/claudeClient.mjs';
import { salvageJson, validateChunkObj } from './lib/examJsonUtils.mjs';
import {
  loadBlueprint,
  curatedDir,
  listCuratedFiles,
  residualGapsPath,
  legacyB1ResidualGapsPath,
  unfilledPartsPath,
  shortCuratedId,
  examTypeForLang,
} from './lib/examPipeline.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { verifyTopicCoherence } = require(path.join(ROOT, 'netlify/functions/lib/topicCoherenceGate.js'));

loadEnvFile();

const MAX_ATTEMPTS = 3;

function parseArgs(argv) {
  const opts = { lang: null, level: null, apply: false, dryRun: true, yes: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') {
      opts.apply = true;
      opts.dryRun = false;
    } else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--yes') opts.yes = true;
    else if (a === '--lang') opts.lang = argv[++i]?.toLowerCase();
    else if (a === '--level') opts.level = String(argv[++i] || '').toUpperCase();
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  if (opts.apply) opts.dryRun = false;
  return opts;
}

function examModel() {
  return (
    process.env.EXAM_MODEL ||
    process.env.CLAUDE_EXAM_MODEL ||
    'claude-sonnet-4-6'
  ).trim();
}

function verifyModel() {
  return (process.env.CLAUDE_VERIFY_MODEL || 'claude-sonnet-4-6').trim();
}

function textHash(text) {
  return crypto.createHash('sha256').update(String(text || '').trim()).digest('hex').slice(0, 16);
}

function loadEngine() {
  const load = (rel) => require(path.join(ROOT, rel));
  load('js/engine/domain/lexicoilDomain.js');
  load('js/engine/knowledge/KnowledgeLoader.js');
  load('js/engine/providers/baseProviderAdapter.js');
  load('js/engine/providers/goetheAdapter.js');
  load('js/engine/providers/cambridgeAdapter.js');
  load('js/engine/providers/deleAdapter.js');
  load('js/engine/providers/providerRegistry.js');
  return {
    KnowledgeEngine: load('js/engine/knowledge/KnowledgeEngine.js'),
    PromptBuilder: load('js/engine/prompts/PromptBuilder.js'),
    BlueprintPromptBinding: load('js/engine/prompts/blueprintPromptBinding.js'),
    ExamRenumber: load('js/engine/examRenumber.js'),
    validateExamAgainstBlueprint: load('js/engine/validation/blueprintFidelity.js')
      .validateExamAgainstBlueprint,
    AnswerKeyVerifier: load('js/engine/validation/AnswerKeyVerifier.js'),
    validateGeneratedExam: load('netlify/functions/lib/examQualityGate.js').validateGeneratedExam,
    verifyPartQuestionsWithAI: load('netlify/functions/lib/examQualityGate.js')
      .verifyPartQuestionsWithAI,
    LexiCoilDomain: load('js/engine/domain/lexicoilDomain.js'),
  };
}

function resolveGapsFile(lang, level) {
  const primary = residualGapsPath(lang, level);
  if (fs.existsSync(primary)) return primary;
  if (lang === 'de' && level === 'B1' && fs.existsSync(legacyB1ResidualGapsPath())) {
    return legacyB1ResidualGapsPath();
  }
  return primary;
}

function resolveUnfilledFile(lang, level) {
  return unfilledPartsPath(lang, level);
}

function modulePartKey(module) {
  if (module === 'lesen') return 'lesenParts';
  if (module === 'horen') return 'horenParts';
  if (module === 'schreiben') return 'schreibenParts';
  if (module === 'sprechen') return 'sprechenParts';
  return `${module}Parts`;
}

function collectCorpus(exams) {
  const passageIds = new Set();
  const textHashes = new Set();
  const fingerprints = new Set();

  function absorbText(t) {
    const h = textHash(t);
    if (h) textHashes.add(h);
  }

  function absorbItem(it) {
    const fp = String(it?.question || it?.signText || it?.text || '')
      .trim()
      .toLowerCase()
      .slice(0, 160);
    if (fp) fingerprints.add(fp);
  }

  for (const exam of exams) {
    for (const p of exam.lesenParts || []) {
      if (p.passageId) passageIds.add(p.passageId);
      if (p.text) absorbText(p.text);
      for (const pp of p.passages || []) {
        if (pp.passageId) passageIds.add(pp.passageId);
        if (pp.text) absorbText(pp.text);
      }
      for (const q of p.questions || []) {
        if (q.passageId) passageIds.add(q.passageId);
        absorbItem(q);
      }
      for (const it of p.items || []) absorbItem(it);
      for (const ad of p.ads || []) absorbText(typeof ad === 'string' ? ad : ad?.text || ad?.title);
    }
    for (const p of exam.horenParts || []) {
      if (p.transcript) absorbText(p.transcript);
      for (const seg of p.segments || []) {
        if (seg.passageId) passageIds.add(seg.passageId);
        if (seg.transcript) absorbText(seg.transcript);
        for (const q of seg.questions || []) absorbItem(q);
      }
      for (const q of p.questions || []) absorbItem(q);
    }
  }
  return { passageIds, textHashes, fingerprints };
}

function partDedupeViolations(part, module, corpus) {
  const issues = [];
  if (module === 'lesen') {
    if (part.passageId && corpus.passageIds.has(part.passageId)) {
      issues.push(`duplicate_passageId:${part.passageId}`);
    }
    if (part.text && corpus.textHashes.has(textHash(part.text))) {
      issues.push('duplicate_passage_text');
    }
    for (const it of part.items || []) {
      const fp = String(it.question || it.signText || '').trim().toLowerCase().slice(0, 160);
      if (fp && corpus.fingerprints.has(fp)) issues.push(`duplicate_item:${fp.slice(0, 40)}`);
    }
  }
  if (module === 'horen') {
    if (part.transcript && corpus.textHashes.has(textHash(part.transcript))) {
      issues.push('duplicate_transcript');
    }
    for (const seg of part.segments || []) {
      if (seg.passageId && corpus.passageIds.has(seg.passageId)) {
        issues.push(`duplicate_passageId:${seg.passageId}`);
      }
      if (seg.transcript && corpus.textHashes.has(textHash(seg.transcript))) {
        issues.push('duplicate_segment_transcript');
      }
    }
  }
  return issues;
}

function extractPartFromChunk(chunk, obj) {
  const arr = obj[chunk.expectKey];
  if (!Array.isArray(arr) || !arr.length) throw new Error(`empty ${chunk.expectKey}`);
  const part = arr.find((p) => Number(p.teil) === Number(chunk.teil)) || arr[0];
  if (!part) throw new Error('no part in chunk response');
  return JSON.parse(JSON.stringify(part));
}

async function buildResidualChunk(engine, { blueprint, module, teil, topic, lang, level, retryErrors }) {
  const { PromptBuilder, BlueprintPromptBinding, KnowledgeEngine } = engine;
  const language = engine.LexiCoilDomain.languageFromSubjectCode(lang);
  const provider = examTypeForLang(lang);

  const filtered = {
    ...blueprint,
    modules: (blueprint.modules || []).filter((m) => m.id === module),
  };

  const spec = await KnowledgeEngine.buildSpec({
    language,
    level,
    provider,
    contentType: 'Exam',
    topic,
  });
  spec.metadata = { ...(spec.metadata || {}), blueprint: filtered };
  spec.skills = [module];
  spec.personalTeilFilter = Number(teil);

  const built = PromptBuilder.buildPersonalExamChunksFromBlueprint(spec, filtered);
  const chunk = built.chunks?.[0];
  if (!chunk) throw new Error(`no chunk for ${module} T${teil}`);

  const bpPart = chunk.blueprintPart;
  const residualRules = [
    '',
    'RESIDUAL PART GENERATION (mandatory scope):',
    `- Generate ONLY ${module} Teil ${teil} — no other modules or Teile.`,
    `- Exam theme/topic: "${topic}". All content must fit this theme.`,
    `- EXACTLY ${bpPart?.itemsTotal ?? '?'} scorable items; types: ${(bpPart?.questionTypes || []).join(', ') || 'per blueprint'}.`,
    bpPart?.wordsPerPassage
      ? `- wordsPerPassage: ${bpPart.wordsPerPassage.min}-${bpPart.wordsPerPassage.max}.`
      : '',
    bpPart?.wordsPerTranscript
      ? `- wordsPerTranscript: ${bpPart.wordsPerTranscript.min}-${bpPart.wordsPerTranscript.max} (HARD MINIMUM — count words before returning).`
      : '',
    module === 'horen' && Number(teil) === 2 && bpPart?.wordsPerTranscript?.min
      ? `- Hören T2 transcript MUST be at least ${bpPart.wordsPerTranscript.min} words. Shorter transcripts are rejected.`
      : '',
    '- Return ONE JSON object with ONLY the root expectKey array containing exactly ONE part object.',
    '- Do NOT truncate transcripts or omit required fields.',
  ].filter(Boolean);

  let prompt = `${chunk.prompt}\n${residualRules.join('\n')}`;
  if (retryErrors?.length) {
    prompt += `\n\nVALIDATION FIX REQUIRED:\n${retryErrors.map((e) => `- ${e}`).join('\n')}`;
    prompt += BlueprintPromptBinding.validationRetryHint(retryErrors);
  }

  let maxTokens = chunk.maxTokens || 4000;
  if (module === 'horen' && Number(teil) === 2) maxTokens = Math.max(maxTokens, 5000);
  maxTokens = Math.min(maxTokens, Number(process.env.GEN_MAX_OUTPUT_TOKENS || 6000));

  return {
    expectKey: chunk.expectKey,
    label: `${module} T${teil} (residual)`,
    teil: Number(teil),
    moduleId: module,
    blueprintPart: bpPart,
    maxTokens,
    prompt,
  };
}

function validatePartStrict(engine, part, module, teil, blueprint, lang) {
  const key = modulePartKey(module);
  const exam = { lang, level: blueprint.level || 'B1', topic: 'residual-check', [key]: [part] };

  const fidelity = engine.validateExamAgainstBlueprint(exam, blueprint);
  const detail = (fidelity.details || []).find(
    (d) => d.module === module && Number(d.teil) === Number(teil),
  );
  const teilIssues = detail?.issues || [];
  const structural = new engine.AnswerKeyVerifier().collectStructuralKeyErrors(exam);
  const gate = engine.validateGeneratedExam(exam, {
    blueprint,
    cefrGate: true,
    curation: true,
  });

  const errors = [
    ...teilIssues,
    ...structural,
    ...(gate.errors || []),
  ];
  const partOk = teilIssues.length === 0 && structural.length === 0 && gate.valid;

  return {
    ok: partOk,
    errors,
    globalFidelityOk: fidelity.ok,
    fidelityOk: teilIssues.length === 0,
    structuralOk: structural.length === 0,
    gateOk: gate.valid,
  };
}

async function callClaudeJson(prompt, maxTokens, model) {
  const { text } = await generateContent({
    prompt,
    model: model || examModel(),
    maxTokens,
  });
  return salvageJson(text);
}

function normalizeMatchKey(k) {
  return String(k ?? '')
    .trim()
    .replace(/^\s*([a-jA-J0-9]+)\)\s*/, '$1')
    .toUpperCase();
}

function adsFromPart(part) {
  if (Array.isArray(part.ads) && part.ads.length) {
    return part.ads.map((ad) =>
      typeof ad === 'string'
        ? ad
        : `${String(ad.key || '').toLowerCase()}) ${ad.title || ''} ${ad.text || ''}`.trim(),
    );
  }
  if (part.text) {
    return String(part.text)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }
  return [];
}

function buildMatchZeroPrompt(item, ads, topic, blueprint, failReason) {
  const cert = blueprint?.certificate || `${examTypeForLang(blueprint?.language || 'de')} ${blueprint?.level || ''}`.trim();
  return [
    `You are a ${cert} exam editor fixing Lesen Teil 3 (Anzeigen zuordnen).`,
    `Exam topic: ${topic}.`,
    'The item has correct "0" but our renderer requires correct to be a letter A–J matching one ad.',
    'You MUST NOT output correct "0".',
    '',
    'ADS a–j (shared for all situations in this Teil):',
    ads.join('\n'),
    '',
    'CURRENT ITEM:',
    JSON.stringify(
      {
        question: item.question,
        signText: item.signText,
        options: item.options,
        explanation: item.explanation,
      },
      null,
      2,
    ),
    '',
    'Rules:',
    '- If exactly ONE ad a–j matches the situation, return {"action":"assign","correct":"H","explanation":"..."}.',
    '- If no ad fits or "0" was intended, return {"action":"regenerate","item":{...full item...}} where:',
    '  * question/signText describes a situation matching EXACTLY ONE ad a–j',
    '  * correct and correctAnswer are that letter (a–j, lowercase ok)',
    '  * type is "matching", options[] lists all ads a–j (same texts as above)',
    '  * include grammarTags, topicTags, vocabularyTags, difficulty (3–6)',
    '- Return ONLY valid JSON, no markdown.',
    failReason ? `\nPrevious attempt failed: ${failReason}` : '',
  ].join('\n');
}

async function verifyMatchingItem(engine, item, part, apiKey, lang, level) {
  process.env.EXAM_ANSWER_KEY_VERIFY = '1';
  const mini = {
    lang,
    level,
    lesenParts: [{ teil: 3, items: [item], ads: part.ads, text: part.text }],
  };
  const structural = new engine.AnswerKeyVerifier().collectStructuralKeyErrors(mini);
  if (structural.length) return { ok: false, reason: structural.join('; ') };

  const passage = { text: adsFromPart(part).join('\n') };
  const verify = await engine.verifyPartQuestionsWithAI([item], {
    passage,
    module: 'lesen',
    apiKey,
  });
  if (verify.skipped && verify.reason === 'disabled') {
    return { ok: true, skipped: true };
  }
  if (verify.failed?.length) {
    return { ok: false, reason: verify.failures?.map((f) => f.reason).join(', ') || 'verify_failed' };
  }
  return { ok: true };
}

function matchZeroItemIndexes(part) {
  return (part.items || [])
    .map((it, i) =>
      normalizeMatchKey(it.correct) === '0' || normalizeMatchKey(it.correctAnswer) === '0' ? i : -1,
    )
    .filter((i) => i >= 0);
}

async function fixOneMatchZeroItem(engine, { item, idx, part, ads, topic, blueprint, apiKey, examId, report, lang, level }) {
  let lastFail = '';
  const log = {
    examId,
    module: 'lesen',
    teil: 3,
    kind: 'match_zero_fix',
    topic,
    itemId: item.id,
    status: 'failed',
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const prompt = buildMatchZeroPrompt(item, ads, topic, blueprint, lastFail);
      const raw = await callClaudeJson(prompt, 2500, examModel());
      let updated = null;

      if (raw.action === 'assign' && raw.correct) {
        const key = normalizeMatchKey(raw.correct);
        if (key === '0' || !/^[A-J]$/.test(key)) {
          lastFail = 'assign returned invalid key';
          continue;
        }
        updated = {
          ...item,
          correct: key.toLowerCase(),
          correctAnswer: key.toLowerCase(),
          explanation: raw.explanation || item.explanation,
        };
      } else if (raw.action === 'regenerate' && raw.item) {
        updated = { ...raw.item, type: raw.item.type || 'matching' };
        const key = normalizeMatchKey(updated.correct ?? updated.correctAnswer);
        if (key === '0' || !/^[A-J]$/.test(key)) {
          lastFail = 'regenerate returned invalid key';
          continue;
        }
        updated.correct = key.toLowerCase();
        updated.correctAnswer = key.toLowerCase();
        if (!updated.id) updated.id = item.id || `ql_fix_t3_${attempt}`;
      } else {
        lastFail = 'unrecognized response shape';
        continue;
      }

      const verify = await verifyMatchingItem(engine, updated, part, apiKey, lang, level);
      if (!verify.ok) {
        lastFail = verify.reason || 'verify failed';
        continue;
      }

      part.items[idx] = updated;
      log.status = 'accepted';
      log.correct = updated.correct;
      log.attempt = attempt;
      report.aiFixes.push(log);
      return updated;
    } catch (e) {
      lastFail = e.message;
    }
  }

  log.reason = lastFail;
  report.aiFixes.push(log);
  return { ok: false, reason: lastFail || 'max_attempts' };
}

async function fixMatchZeroItems(engine, wrapper, blueprint, apiKey, report, lang, level) {
  const examId = wrapper.id;
  const topic = wrapper.topic || wrapper.exam?.topic;
  if (!topic) return { fixed: 0, failed: 0, skipped: true };

  const exam = wrapper.exam;
  const part = (exam.lesenParts || []).find((p) => Number(p.teil) === 3);
  if (!part?.items?.length) return { fixed: 0, failed: 0 };

  const ads = adsFromPart(part);
  let fixed = 0;
  let failed = 0;

  while (matchZeroItemIndexes(part).length) {
    const idx = matchZeroItemIndexes(part)[0];
    const item = part.items[idx];
    const result = await fixOneMatchZeroItem(engine, {
      item,
      idx,
      part,
      ads,
      topic,
      blueprint,
      apiKey,
      examId,
      report,
      lang,
      level,
    });
    if (result?.ok === false) {
      failed++;
      report.unfilled.push({
        examId,
        module: 'lesen',
        teil: 3,
        slotType: 'ads_matching',
        kind: 'match_zero_fix',
        itemId: item.id,
        reason: result.reason,
      });
      break;
    }
    fixed++;
  }

  return { fixed, failed };
}

async function generateResidualPart(engine, { blueprint, module, teil, topic, lang, corpus, apiKey }) {
  let lastErrors = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const chunk = await buildResidualChunk(engine, {
      blueprint,
      module,
      teil,
      topic,
      lang,
      level: blueprint.level,
      retryErrors: lastErrors,
    });

    try {
      const raw = await callClaudeJson(chunk.prompt, chunk.maxTokens, examModel());
      const obj = validateChunkObj(chunk, raw);
      const part = extractPartFromChunk(chunk, obj);
      part.teil = Number(teil);

      const dedupe = partDedupeViolations(part, module, corpus);
      if (dedupe.length) {
        lastErrors = dedupe;
        continue;
      }

      const check = validatePartStrict(engine, part, module, teil, blueprint, lang);
      if (!check.ok) {
        lastErrors = check.errors.slice(0, 12);
        continue;
      }

      return { ok: true, part, attempt, chunk };
    } catch (e) {
      lastErrors = [e.message];
    }
  }
  return { ok: false, errors: lastErrors };
}

function replacePart(exam, module, teil, newPart) {
  const key = modulePartKey(module);
  if (!exam[key]) exam[key] = [];
  const idx = exam[key].findIndex((p) => Number(p.teil) === Number(teil));
  const part = { ...newPart, teil: Number(teil) };
  if (idx >= 0) exam[key][idx] = part;
  else exam[key].push(part);
}

async function confirmApply(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(String(ans).trim()));
    });
  });
}

function needsFullPartGeneration(gap) {
  if (gap.reason === 'match_zero_not_fillable_by_pool') return false;
  return gap.missing?.items > 0 || gap.missing?.passages > 0 || gap.missing?.segments > 0;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log(`Usage:
  node scripts/generate-residual-parts.mjs --lang de --level B1 [--dry-run]
  node scripts/generate-residual-parts.mjs --lang de --level B1 --apply [--yes]`);
    process.exit(0);
  }
  if (!opts.lang || !opts.level) {
    console.error('Required: --lang (de|en|es) and --level (A1–C2)');
    process.exit(2);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      '\n❌ Falta ANTHROPIC_API_KEY en el entorno (.env).\n' +
        '   Exporta la clave antes de ejecutar generate-residual-parts.\n',
    );
    process.exit(1);
  }

  process.env.EXAM_ANSWER_KEY_VERIFY = '1';
  process.env.CEFR_GATE = '1';
  process.env.TOPIC_COHERENCE_GATE = process.env.TOPIC_COHERENCE_GATE || '1';
  process.env.LC_AI_PATH_BLUEPRINTS = '1';
  process.env.AI_PATH_BLUEPRINTS = '1';

  const engine = loadEngine();
  let blueprint;
  try {
    blueprint = loadBlueprint(opts.lang, opts.level);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const dir = curatedDir(opts.lang, opts.level);
  const gapFile = resolveGapsFile(opts.lang, opts.level);
  const unfilledOut = resolveUnfilledFile(opts.lang, opts.level);

  if (!fs.existsSync(dir)) {
    console.error(`Missing curated dir: ${path.relative(ROOT, dir)}`);
    process.exit(1);
  }
  if (!fs.existsSync(gapFile)) {
    console.error(
      `Missing ${path.relative(ROOT, gapFile)} — run: npm run fill:pool -- --lang ${opts.lang} --level ${opts.level}`,
    );
    process.exit(1);
  }

  const gaps = JSON.parse(fs.readFileSync(gapFile, 'utf8'));
  const files = listCuratedFiles(opts.lang, opts.level);

  const wrappers = files.map((f) => {
    const w = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    w._file = f;
    return w;
  });

  const working = Object.fromEntries(
    wrappers.map((w) => [w.id, structuredClone(w)]),
  );
  const corpus = collectCorpus(wrappers.map((w) => w.exam));
  const changedIds = new Set();

  const report = {
    generatedAt: new Date().toISOString(),
    mode: opts.apply ? 'apply' : 'dry-run',
    model: examModel(),
    verifyModel: verifyModel(),
    poolSource: 'scripts/fill-gaps-from-pool.mjs (prior pass)',
    aiFixes: [],
    aiParts: [],
    unfilled: [],
    perExam: {},
  };

  for (const w of wrappers) {
    report.perExam[w.id] = {
      topic: w.topic || w.exam?.topic,
      initialGaps: gaps.filter((g) => g.examId === w.id),
      pool: [],
      ai: [],
      unfilled: [],
    };
  }

  for (const g of gaps) {
    if (g.reason?.includes('pool')) {
      report.perExam[g.examId]?.pool.push(`${g.module} T${g.teil}: ${g.reason}`);
    }
  }

  console.log(`\n══ generate-residual-parts (${report.mode}) ══ ${opts.lang}/${opts.level} ══`);
  console.log(`Model: ${examModel()} | gaps: ${gaps.length} | exams: ${wrappers.length}\n`);

  // ── 1. Fix Lesen T3 correct:"0" when topic is known ──
  for (const wrapper of wrappers) {
    const part = (wrapper.exam?.lesenParts || []).find((p) => Number(p.teil) === 3);
    if (!part || !matchZeroItemIndexes(part).length) continue;
    const examId = wrapper.id;
    const topic = wrapper.topic || wrapper.exam?.topic;
    console.log(`▶ match_zero fix: ${shortCuratedId(examId, opts.lang, opts.level)} (${topic || 'no topic'})`);
    const { fixed, failed, skipped } = await fixMatchZeroItems(
      engine,
      working[examId],
      blueprint,
      apiKey,
      report,
      opts.lang,
      opts.level,
    );
    if (skipped) {
      console.log('  · skipped (no topic on wrapper)');
      continue;
    }
    if (fixed > 0) {
      engine.ExamRenumber.renumberExam(working[examId].exam, blueprint);
      const partAfter = working[examId].exam.lesenParts.find((p) => Number(p.teil) === 3);
      const check = validatePartStrict(engine, partAfter, 'lesen', 3, blueprint, opts.lang);
      const remaining = matchZeroItemIndexes(partAfter).length;
      if (check.ok && remaining === 0) {
        changedIds.add(examId);
        report.perExam[examId].ai.push(`lesen T3: ${fixed} match_zero → valid A–J key`);
        console.log(`  ✓ accepted (${fixed} item(s) fixed)`);
      } else {
        const reason =
          check.errors.join('; ') ||
          (remaining ? `${remaining} item(s) still have correct:"0"` : 'post-fix validation failed');
        report.unfilled.push({
          examId,
          module: 'lesen',
          teil: 3,
          kind: 'match_zero_fix',
          reason,
        });
        report.perExam[examId].unfilled.push(`lesen T3: ${reason}`);
        console.log(`  ✗ ${reason}`);
      }
    } else if (failed > 0) {
      report.perExam[examId].unfilled.push('lesen T3: match_zero fix failed');
      console.log(`  ✗ could not fix match_zero`);
    } else {
      console.log(`  · no match_zero items`);
    }
  }

  // ── 2. Generate full residual parts (e.g. Hören T2) ──
  const partJobs = gaps.filter(needsFullPartGeneration);
  for (const gap of partJobs) {
    const wrapper = working[gap.examId];
    if (!wrapper) continue;
    const topic = wrapper.topic || wrapper.exam?.topic || 'daily_life';
    console.log(`▶ generate part: ${gap.examId} ${gap.module} T${gap.teil} (${gap.slotType})`);

    const gen = await generateResidualPart(engine, {
      blueprint,
      module: gap.module,
      teil: gap.teil,
      topic,
      lang: opts.lang,
      corpus,
      apiKey,
    });

    if (!gen.ok) {
      const row = {
        examId: gap.examId,
        module: gap.module,
        teil: gap.teil,
        slotType: gap.slotType,
        reason: (gen.errors || []).join('; ') || 'generation_failed',
      };
      report.unfilled.push(row);
      report.perExam[gap.examId].unfilled.push(`${gap.module} T${gap.teil}: ${row.reason}`);
      report.aiParts.push({ ...row, status: 'failed' });
      console.log(`  ✗ failed after ${MAX_ATTEMPTS} attempts`);
      continue;
    }

    const coherence = await verifyTopicCoherence(gen.part, {
      topic,
      lang: opts.lang,
      level: opts.level,
      apiKey,
      module: gap.module,
      teil: gap.teil,
    });
    if (!coherence.skipped && (!coherence.onTopic || !coherence.cefrOk)) {
      const reason = `topic_coherence_failed: ${(coherence.issues || []).join('; ') || 'off_topic'}`;
      const row = {
        examId: gap.examId,
        module: gap.module,
        teil: gap.teil,
        slotType: gap.slotType,
        reason,
      };
      report.unfilled.push(row);
      report.perExam[gap.examId].unfilled.push(`${gap.module} T${gap.teil}: ${reason}`);
      report.aiParts.push({ ...row, status: 'rejected_coherence' });
      console.log(`  ✗ rejected by topic coherence gate`);
      continue;
    }

    report.aiParts.push({
      examId: gap.examId,
      module: gap.module,
      teil: gap.teil,
      status: 'accepted',
      attempt: gen.attempt,
    });
    report.perExam[gap.examId].ai.push(`${gap.module} T${gap.teil}: generated (${gen.attempt} attempt(s))`);

    replacePart(wrapper.exam, gap.module, gap.teil, gen.part);
    engine.ExamRenumber.renumberExam(wrapper.exam, blueprint);
    changedIds.add(gap.examId);
    const seg = gen.part.segments?.[0];
    if (seg?.passageId) corpus.passageIds.add(seg.passageId);
    if (seg?.transcript) corpus.textHashes.add(textHash(seg.transcript));
    if (gen.part.transcript) corpus.textHashes.add(textHash(gen.part.transcript));
    console.log(`  ✓ accepted (attempt ${gen.attempt})`);
  }

  // ── 3. Final fidelity per exam (working copies) ──
  for (const w of wrappers) {
    const fin = engine.validateExamAgainstBlueprint(working[w.id].exam, blueprint);
    report.perExam[w.id].fidelityOk = fin.ok;
    report.perExam[w.id].errorCount = fin.errors.length;
  }

  const examsWithHoles = Object.entries(report.perExam).filter(
    ([, r]) => !r.fidelityOk || r.unfilled.length,
  );

  if (opts.apply) {
    if (examsWithHoles.length && !opts.yes) {
      console.log(
        `\n⚠ Quedan ${examsWithHoles.length} examen(es) con huecos o sin pasar fidelidad:`,
      );
      for (const [id, r] of examsWithHoles) {
        console.log(`   - ${shortCuratedId(id, opts.lang, opts.level)}: ${r.unfilled.join('; ') || 'fidelity fail'}`);
      }
      const ok = await confirmApply('¿Aplicar cambios aceptados en curated de todos modos? [y/N] ');
      if (!ok) {
        console.log('\nAbortado — no se escribieron curated.\n');
        fs.mkdirSync(path.dirname(unfilledOut), { recursive: true });
        fs.writeFileSync(unfilledOut, JSON.stringify(report.unfilled, null, 2) + '\n', 'utf8');
        process.exit(1);
      }
    }
    for (const examId of changedIds) {
      const w = wrappers.find((x) => x.id === examId);
      const src = working[examId];
      if (!w || !src) continue;
      w.exam = src.exam;
      fs.writeFileSync(path.join(dir, w._file), JSON.stringify(w, null, 2) + '\n', 'utf8');
    }
  }

  fs.mkdirSync(path.dirname(unfilledOut), { recursive: true });
  fs.writeFileSync(unfilledOut, JSON.stringify(report.unfilled, null, 2) + '\n', 'utf8');

  console.log('\n── Summary per exam ──');
  for (const [examId, row] of Object.entries(report.perExam)) {
    const short = shortCuratedId(examId, opts.lang, opts.level);
    console.log(`\n  ${short} (${row.topic})`);
    console.log(`    initial gaps: ${row.initialGaps.length}`);
    if (row.pool.length) console.log(`    pool (no fill): ${row.pool.join('; ')}`);
    if (row.ai.length) console.log(`    IA: ${row.ai.join('; ')}`);
    if (row.unfilled.length) console.log(`    sin rellenar: ${row.unfilled.join('; ')}`);
    console.log(`    fidelity after: ${row.fidelityOk ? 'OK' : `FAIL (${row.errorCount} err)`}`);
  }

  console.log(`\n── Totals ──`);
  console.log(`  IA fixes (match_zero): ${report.aiFixes.filter((f) => f.status === 'accepted').length}`);
  console.log(`  IA parts generated: ${report.aiParts.filter((p) => p.status === 'accepted').length}`);
  console.log(`  unfilled: ${report.unfilled.length} → ${path.relative(ROOT, unfilledOut)}`);

  if (opts.dryRun) {
    console.log('\nDRY-RUN — Claude calls executed; curated NOT written (use --apply to save).\n');
  } else {
    console.log(`\nAPPLY — ${changedIds.size} curated file(s) updated.\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
