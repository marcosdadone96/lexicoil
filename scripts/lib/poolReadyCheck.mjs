/**
 * poolReadyCheck.mjs — Meta-gate único: un veredicto por archivo.
 *
 * Reutiliza gates existentes (no reimplementa detección):
 *   1–3 REPAIRABLE: caps / markdown / collapseIdenticalPassages
 *   4–8 REJECT: topic, discard lists, Q1a, Q2, retrieval metadata
 *
 *   import { poolReadyCheck, applyPoolRepairs } from './lib/poolReadyCheck.mjs';
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import {
  applyGermanCapsNormalize,
  GERMAN_CAPS_NORMALIZE_VERSION,
} from './germanCapsNormalize.mjs';
import { stripMarkdownLeakInBatch } from './stripMarkdownLeak.mjs';
import { collapseIdenticalPassages } from './normalizeBatch.mjs';
import { checkPassageContentTopic } from './qualityGates/contentTopicCheck.mjs';
import { checkLesenT5BatchTopic } from './lesenT5TopicFilter.mjs';
import { runMetadataSchemaGate } from './qualityGates/metadataSchemaGate.mjs';
import { runDuplicateContentGate } from './qualityGates/duplicateContentGate.mjs';
import { buildDedupCorpus, corpusExcludingSource } from './qualityGates/dedupCorpus.mjs';
import { runAnswerKeyCoherenceGate } from './qualityGates/answerKeyCoherenceGate.mjs';
import { findKeyExplanationMismatches } from './keyExplanationGate.mjs';
import {
  loadAssembleDiscardLists,
  isAssembleBlocked,
} from './assembleDiscardLists.mjs';
import { LEGACY_TOPIC_SLUGS } from './qualityGates/topicFamilies.mjs';
import { normalizeB1Topic, isValidB1Topic } from './b1Topics.mjs';
import { READY_LESEN_DIR } from './batchPaths.mjs';
import {
  GENERATED_DIR,
  bankQuestionsPath,
  inferBatchLevel,
  normalizeLevel,
  allStagingScanDirs,
  allStagingScanDirsAllLevels,
} from './batchPaths.mjs';
import { assertSchreibenNoPlaceholders } from './schreibenPlaceholderGate.mjs';
import { runGermanContentLanguageGate } from './qualityGates/germanContentLanguageGate.mjs';
import { checkT3PoolDedup } from './t3PoolDedupGate.mjs';
import { checkT4PoolDedup } from './lesenT4PoolDedupGate.mjs';
import { stripCorruptedVocabularyTags } from './chk31VocabLemma.mjs';
import { enrichBatchMetadata } from './enrichBatchMetadata.mjs';

export { GERMAN_CAPS_NORMALIZE_VERSION };

/** Stamp missing/stale vs today's normalizer — repairable, not content reject. */
export const CAPS_VERSION_STALE = 'caps_version_stale';

const GENERATED_DIR_LEGACY = GENERATED_DIR;
const GATE_LOGS = path.join(ROOT, 'batches/ready/gate-logs');

const REPAIRABLE_RULES = new Set([
  'caps_needs_normalize',
  CAPS_VERSION_STALE,
  'markdown_leak',
  'identical_passages',
  'missing_grammarTags',
  'missing_vocabularyTags',
]);

/** @type {{ blockedIds: Set<string>, sources: Map<string, string[]> } | null} */
let _discardCache = null;
/** @type {object | null} */
let _dedupCorpus = null;
/** @type {Map<string, { verdict: string, wouldBlock: boolean, findings: object[] }> | null} */
let _q2Cache = null;

function clone(batch) {
  return structuredClone(batch);
}

export function inferModuleTeilFromName(file) {
  const base = path.basename(String(file || ''), '.json');
  const m = base.match(/^(lesen|horen|schreiben|sprechen)(?:-t(\d+))?/i);
  if (!m) return { module: 'unknown', teil: null };
  return { module: m[1].toLowerCase(), teil: m[2] ? Number(m[2]) : null };
}

function stem(file) {
  return path.basename(String(file || ''), '.json');
}

export function getDiscardCache(opts = {}) {
  if (!_discardCache || opts.reload) {
    _discardCache = loadAssembleDiscardLists(opts);
  }
  return _discardCache;
}

export function getDedupCorpusCache(opts = {}) {
  if (!_dedupCorpus || opts.reload) {
    const level = opts.level ? normalizeLevel(opts.level) : null;
    const dirs = opts.dirs || (level ? allStagingScanDirs(level) : allStagingScanDirsAllLevels());
    const bankPath =
      opts.bankPath ||
      bankQuestionsPath(opts.lang || 'de', level || opts.batchLevel || 'B1');
    _dedupCorpus = buildDedupCorpus({
      dirs,
      bankPath,
    });
  }
  return _dedupCorpus;
}

/** Load latest Q2 dry-run JSONL results (basename → verdict). */
export function loadQ2EvaluationCache(opts = {}) {
  if (_q2Cache && !opts.reload) return _q2Cache;
  const map = new Map();
  const dir = opts.gateLogsDir || GATE_LOGS;
  if (!fs.existsSync(dir)) {
    _q2Cache = map;
    return map;
  }
  const logs = fs
    .readdirSync(dir)
    .filter((f) => /^dryrun-Q2-answerKeyCoherence-.*\.jsonl$/i.test(f))
    .sort();
  for (const name of logs) {
    const lines = fs.readFileSync(path.join(dir, name), 'utf8').split(/\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        const file = path.basename(String(row.file || '').replace(/\\/g, '/'));
        if (!file) continue;
        map.set(file, {
          verdict: row.verdict || (row.wouldBlock ? 'block' : 'pass'),
          wouldBlock: Boolean(row.wouldBlock),
          findings: row.findings || [],
        });
      } catch {
        /* skip */
      }
    }
  }
  _q2Cache = map;
  return map;
}

function collectTopicTags(batch) {
  const tags = [];
  if (batch.topicTag) tags.push(String(batch.topicTag));
  if (batch._requestedTopic) tags.push(String(batch._requestedTopic));
  for (const p of batch.passages || []) {
    if (p.topicTag) tags.push(String(p.topicTag));
  }
  for (const q of batch.questions || []) {
    for (const t of q.topicTags || []) tags.push(String(t));
    if (q.topicTag) tags.push(String(q.topicTag));
  }
  return tags;
}

/**
 * Retrieval metadata (nuevo): topicTag real + grammarTags + vocabularyTags.
 * @returns {string[]} reason codes
 */
export function checkRetrievalMetadata(batch) {
  const reasons = [];
  const tags = collectTopicTags(batch);
  if (!tags.length) {
    reasons.push('missing_topicTag');
  } else {
    const normalized = tags.map((t) => normalizeB1Topic(t) || t);
    const allLegacy = tags.every((t) => LEGACY_TOPIC_SLUGS.has(String(t).toLowerCase()));
    const anyDaily = tags.some((t) => String(t).toLowerCase() === 'daily_life');
    const anyCanonical = normalized.some((t) => isValidB1Topic(t));
    if (anyDaily || (allLegacy && !anyCanonical)) {
      reasons.push('legacy_or_daily_life_topic');
    }
    if (!anyCanonical && !allLegacy) {
      // unknown slug that isn't B1 — still reject for retrieval
      if (!tags.some((t) => isValidB1Topic(normalizeB1Topic(t) || t))) {
        reasons.push('non_canonical_topicTag');
      }
    }
  }

  const qs = batch.questions || [];
  if (qs.length) {
    const withGram = qs.filter((q) => Array.isArray(q.grammarTags) && q.grammarTags.length > 0);
    const withVoc = qs.filter((q) => Array.isArray(q.vocabularyTags) && q.vocabularyTags.length > 0);
    if (!withGram.length) reasons.push('missing_grammarTags');
    if (!withVoc.length) reasons.push('missing_vocabularyTags');
  } else {
    reasons.push('missing_questions');
  }
  return reasons;
}

/**
 * Stamp batch with the normalizer version used for gate 1.
 * READY always means «verified against GERMAN_CAPS_NORMALIZE_VERSION of today».
 */
export function stampGermanCapsVersion(batch) {
  const next = clone(batch);
  next._germanCapsNormalizeVersion = GERMAN_CAPS_NORMALIZE_VERSION;
  next._germanCapsNormalizedAt = new Date().toISOString();
  return next;
}

function capsVersionIsCurrent(batch) {
  return batch?._germanCapsNormalizeVersion === GERMAN_CAPS_NORMALIZE_VERSION;
}

/**
 * Apply automated repairs (gates 1–3). Returns repaired batch + what changed.
 * Always re-runs germanCapsNormalize (current code) and restamps version —
 * so adding guard #50 + bumping GERMAN_CAPS_NORMALIZE_VERSION invalidates old READY.
 */
export function applyPoolRepairs(batch) {
  let current = clone(batch);
  const applied = [];

  const md = stripMarkdownLeakInBatch(clone(current));
  if (md.totalFixed > 0) {
    current = md.batch;
    applied.push(`markdown:${md.totalFixed}`);
  }

  const beforeN = (current.passages || []).length;
  const collapsed = collapseIdenticalPassages(clone(current));
  if ((collapsed.passages || []).length < beforeN) {
    current = collapsed;
    applied.push(`collapse:${beforeN}→${(collapsed.passages || []).length}`);
  }

  // Always apply current normalizer (idempotent) — never trust historical file state.
  const caps = applyGermanCapsNormalize(clone(current));
  current = caps.batch;
  const capsTouched =
    caps.stats.fieldsChanged > 0 ||
    caps.stats.tokenChanges > 0 ||
    caps.stats.markdownFixed > 0;
  if (capsTouched) {
    applied.push(
      `caps:md=${caps.stats.markdownFixed},decap=${caps.stats.decapFixed},cap=${caps.stats.capFixed},fields=${caps.stats.fieldsChanged}`,
    );
  }
  const wasStale = !capsVersionIsCurrent(batch);
  current = stampGermanCapsVersion(current);
  if (wasStale || capsTouched) {
    applied.push(`caps:version=${GERMAN_CAPS_NORMALIZE_VERSION}`);
  }

  const chk31 = stripCorruptedVocabularyTags(current);
  if (chk31.stripped) {
    current = chk31.batch;
    applied.push(`chk31:strip=${chk31.stripped}`);
    ({ batch: current } = enrichBatchMetadata(clone(current), {
      vocab: true,
      grammar: false,
      topic: false,
    }));
    applied.push('chk31:re-enrich-vocab');
  }

  const metaGap = checkRetrievalMetadata(current);
  if (metaGap.includes('missing_grammarTags') || metaGap.includes('missing_vocabularyTags')) {
    ({ batch: current } = enrichBatchMetadata(clone(current), {
      vocab: true,
      grammar: true,
      topic: true,
      fillGrammarDefaults: metaGap.includes('missing_grammarTags'),
    }));
    applied.push('meta:enrich-retrieval-tags');
  }

  return { batch: current, applied };
}

/**
 * Detect repairable issues 1–3 without mutating.
 * Gate 1 compares against the CURRENT germanCapsNormalize implementation and version stamp.
 */
function detectRepairable(batch) {
  const reasons = [];

  const md = stripMarkdownLeakInBatch(clone(batch));
  if (md.totalFixed > 0) reasons.push('markdown_leak');

  const beforeN = (batch.passages || []).length;
  if (beforeN > 1) {
    const collapsed = collapseIdenticalPassages(clone(batch));
    if ((collapsed.passages || []).length < beforeN) reasons.push('identical_passages');
  }

  const caps = applyGermanCapsNormalize(clone(batch));
  const capsContentDrift =
    caps.stats.fieldsChanged > 0 || caps.stats.tokenChanges > 0;
  if (capsContentDrift) reasons.push('caps_needs_normalize');
  else if (caps.stats.markdownFixed > 0 && !reasons.includes('markdown_leak')) {
    reasons.push('markdown_leak');
  }

  // Stamp missing/stale → must re-apply + restamp before READY (covers guard #50 tomorrow)
  if (!capsVersionIsCurrent(batch)) {
    reasons.push(CAPS_VERSION_STALE);
  }

  return reasons;
}

/**
 * @param {object} batch
 * @param {object} [opts]
 * @param {string} [opts.file] — basename or relative path
 * @param {object} [opts.corpus] — shared dedup corpus
 * @param {object} [opts.discard] — shared discard lists
 * @param {Map} [opts.q2Cache]
 * @param {boolean} [opts.q2Llm=false] — run LLM Q2 if no cache
 * @param {boolean} [opts.skipQ1=false]
 * @param {boolean} [opts.skipQ2=false]
 * @param {boolean} [opts.skipMetadata=false]
 */
export async function poolReadyCheck(batch, opts = {}) {
  const file = path.basename(String(opts.file || batch.id || 'unknown.json'));
  const { module, teil } = inferModuleTeilFromName(file);
  const reasons = [];
  const details = [];

  // ——— 1–3 REPAIRABLE ———
  const repairable = detectRepairable(batch);
  for (const r of repairable) {
    reasons.push(r);
    details.push({ rule: r, severity: 'repairable' });
  }

  // ——— Schreiben: unresolved [Name] placeholders ———
  const modEarly = String(batch.module || module || '').toLowerCase();
  if (modEarly === 'schreiben') {
    const ph = assertSchreibenNoPlaceholders(batch);
    for (const msg of ph.issues || []) {
      reasons.push('schreiben_unresolved_placeholder');
      details.push({ rule: 'schreiben_unresolved_placeholder', severity: 'reject', detail: msg });
    }
  }

  // ——— Q5 german content language (deterministic; never trust lang:"de" alone) ———
  const langGate = runGermanContentLanguageGate(batch, { file, lang: 'de' });
  for (const f of langGate.findings || []) {
    reasons.push('non_german_exam_text');
    details.push({
      rule: 'non_german_exam_text',
      severity: 'reject',
      detail: f.detail,
      span: f.span,
    });
  }

  // ——— Lesen T3: situation core dedup + shared-mold family limit ———
  const isLesenT3 =
    (modEarly === 'lesen' || String(batch.module || '').toLowerCase() === 'lesen') &&
    (teil === 3 || Number(batch.questions?.[0]?.teil) === 3);
  if (isLesenT3) {
    const t3dedup = checkT3PoolDedup(batch, { file, reload: true });
    for (const r of t3dedup.reasons || []) {
      reasons.push(r);
    }
    for (const d of t3dedup.details || []) {
      details.push({ ...d, severity: 'reject' });
    }
  }

  const isLesenT4 =
    (modEarly === 'lesen' || String(batch.module || '').toLowerCase() === 'lesen') &&
    (teil === 4 || Number(batch.passages?.[0]?.teil) === 4 || Number(batch.questions?.[0]?.teil) === 4);
  if (isLesenT4) {
    const t4dedup = checkT4PoolDedup(batch, { file, level: opts.level });
    for (const r of t4dedup.reasons || []) {
      reasons.push(r);
    }
    for (const d of t4dedup.details || []) {
      details.push({ ...d, severity: 'reject' });
    }
  }

  // ——— 5 discard lists ———
  const discard = opts.discard || getDiscardCache();
  if (isAssembleBlocked(file, discard.blockedIds) || isAssembleBlocked(batch.id, discard.blockedIds)) {
    reasons.push('discard_list');
    const src = discard.sources?.get(stem(file)) || discard.sources?.get(stem(batch.id)) || [];
    details.push({ rule: 'discard_list', severity: 'reject', sources: src });
  }

  // ——— 4 topic / contentTopicCheck ———
  const mod = String(batch.module || module || '').toLowerCase() || 'lesen';
  // Hören T1 + A2 T3: multi-segment umbrella topicTag — content_topic is audit-only
  // (same policy as generation Q4 hardBlock=false). T2–T4 otherwise blocking.
  const batchLevelForTopic = normalizeLevel(opts.level || inferBatchLevel(batch));
  const horenMultiSegmentContentTopicAuditOnly =
    mod === 'horen' && (teil === 1 || (teil === 3 && batchLevelForTopic === 'A2'));
  if (mod === 'lesen' || mod === 'horen') {
    const q4 = runMetadataSchemaGate(batch, {
      file,
      profile: 'generated',
      module: mod === 'horen' ? 'horen' : 'lesen',
    });
    for (const f of q4.findings || []) {
      if (f.rule === 'topic_mismatch' || f.rule === 'content_topic_mismatch') {
        // Q4 contentTopicCheck findings start with "passage:"; tag-field
        // incompatibilities (_requestedTopic vs topicTag) must still reject on T1.
        const isContentTopicFinding =
          f.rule === 'content_topic_mismatch' ||
          (typeof f.detail === 'string' && /^passage:/i.test(f.detail));
        if (horenMultiSegmentContentTopicAuditOnly && isContentTopicFinding) {
          // Direct loop below audits once with root topicTag (avoid double details).
          continue;
        }
        reasons.push(f.rule);
        details.push({ rule: f.rule, severity: 'reject', detail: f.detail });
      }
    }
    const isLesenT5 =
      mod === 'lesen' &&
      (teil === 5 || Number(batch.questions?.[0]?.teil) === 5 || Number(batch.teil) === 5);
    if (isLesenT5) {
      const t5Topic = checkLesenT5BatchTopic(batch);
      if (!t5Topic.ok) {
        const rule = t5Topic.rule || 'content_topic_mismatch';
        if (!reasons.includes(rule)) reasons.push(rule);
        details.push({ rule, severity: 'reject', detail: t5Topic.issue });
      }
    } else {
      // Prefer root topicTag (enrichment source of truth) over a stale passage tag
      for (const p of batch.passages || []) {
        if (!p?.topicTag && !batch.topicTag) continue;
        const tagged = { ...p, topicTag: batch.topicTag || p.topicTag };
        const ct = checkPassageContentTopic(tagged, {
          level: batchLevelForTopic,
          teil,
          module: mod,
        });
        if (ct.mismatch) {
          if (horenMultiSegmentContentTopicAuditOnly) {
            details.push({
              rule: 'content_topic_mismatch',
              severity: 'audit',
              detail: ct.detail || ct.reason,
              passageId: p.id,
            });
            continue;
          }
          if (!reasons.includes('content_topic_mismatch')) reasons.push('content_topic_mismatch');
          details.push({
            rule: 'content_topic_mismatch',
            severity: 'reject',
            detail: ct.detail || ct.reason,
            passageId: p.id,
          });
        }
      }
    }
  }

  // ——— 6 Q1a cross-file duplicate ———
  if (!opts.skipQ1 && (mod === 'lesen' || mod === 'horen')) {
    try {
      const batchLevel = normalizeLevel(opts.level || inferBatchLevel(batch));
      const corpus =
        opts.corpus ||
        getDedupCorpusCache({ level: batchLevel, lang: opts.lang || 'de', batchLevel });
      // Prefer real path when provided; never assume generated/ if file lives elsewhere.
      const source =
        opts.sourcePath ||
        opts.selfSource ||
        `batches/generated/${file}`;
      const filtered = corpusExcludingSource(corpus, source);
      const q1 = runDuplicateContentGate(batch, {
        file: source,
        selfSource: source,
        corpus: filtered,
        // CRITICAL: use filtered.index — passing corpus.index reintroduces mirror FPs
        // (same logical ID under ready/ / pool-content-ok / needs-regeneration).
        index: filtered.index,
      });
      for (const f of q1.findings || []) {
        if (f.severity === 'block' || f.rule === 'near_duplicate' || f.rule === 'exact_duplicate') {
          reasons.push(f.rule || 'near_duplicate');
          details.push({
            rule: f.rule,
            severity: 'reject',
            detail: f.detail,
          });
        }
      }
    } catch (err) {
      details.push({ rule: 'q1_error', severity: 'warn', detail: err.message });
    }
  }

  // ——— 7 Q2 answer key ———
  if (!opts.skipQ2 && (mod === 'lesen' || mod === 'horen')) {
    const q2Cache = opts.q2Cache || loadQ2EvaluationCache();
    const cached = q2Cache.get(file);
    if (cached) {
      if (cached.wouldBlock || cached.verdict === 'block') {
        reasons.push('q2_answer_key_mismatch');
        details.push({
          rule: 'q2_answer_key_mismatch',
          severity: 'reject',
          detail: 'Q2 dry-run cache: wouldBlock',
          source: 'q2-cache',
        });
      }
    } else if (opts.q2Llm) {
      const q2 = await runAnswerKeyCoherenceGate(batch, {
        file,
        mode: 'audit',
        skipLlm: false,
      });
      if (q2.wouldBlock) {
        reasons.push('q2_answer_key_mismatch');
        details.push({
          rule: 'q2_answer_key_mismatch',
          severity: 'reject',
          detail: (q2.findings || []).map((f) => f.detail).slice(0, 2).join('; '),
          source: 'q2-llm',
        });
      }
    } else {
      // Deterministic CHK-18b (parte de Q2) si aún no evaluado con LLM
      const hits = findKeyExplanationMismatches(batch);
      if (hits.length) {
        reasons.push('q2_chk18b_suspect');
        details.push({
          rule: 'q2_chk18b_suspect',
          severity: 'reject',
          detail: hits[0]?.message || `${hits.length} CHK-18b hit(s)`,
          source: 'chk18b',
        });
      }
    }
  }

  // ——— 8 retrieval metadata ———
  if (!opts.skipMetadata) {
    for (const r of checkRetrievalMetadata(batch)) {
      reasons.push(r);
      details.push({ rule: r, severity: 'reject' });
    }
  }

  const uniq = [...new Set(reasons)];
  const rejectReasons = uniq.filter((r) => !REPAIRABLE_RULES.has(r));
  const repairReasons = uniq.filter((r) => REPAIRABLE_RULES.has(r));
  const META_RULES = new Set([
    'missing_topicTag',
    'legacy_or_daily_life_topic',
    'non_canonical_topicTag',
    'missing_grammarTags',
    'missing_vocabularyTags',
    'missing_questions',
  ]);
  const Q1_RULES = new Set(['exact_duplicate', 'near_duplicate', 'possible_duplicate']);
  const contentReject = rejectReasons.filter((r) => !META_RULES.has(r));
  const q1OnlyReject =
    rejectReasons.length > 0 &&
    rejectReasons.every((r) => Q1_RULES.has(r)) &&
    repairReasons.length === 0;

  let contentVerdict = 'READY';
  if (contentReject.length) contentVerdict = 'REJECT';
  else if (repairReasons.length) contentVerdict = 'REPAIRABLE';

  let verdict = 'READY';
  if (rejectReasons.length) verdict = 'REJECT';
  else if (repairReasons.length) verdict = 'REPAIRABLE';

  return {
    file,
    module,
    teil,
    verdict,
    contentVerdict,
    reasons: uniq,
    repairReasons,
    rejectReasons,
    contentRejectReasons: contentReject,
    q1OnlyReject,
    details,
    ok: verdict === 'READY',
  };
}

/**
 * Check → apply automated repairs (1–3) when needed → re-check.
 * Repairs run even if the file is REJECT for other reasons (cleaner needs-regen copy).
 */
export async function poolReadyCheckWithRepair(batch, opts = {}) {
  const first = await poolReadyCheck(batch, opts);
  if (!first.repairReasons?.length) {
    return { ...first, batch, repaired: false, applied: [] };
  }
  const { batch: fixed, applied } = applyPoolRepairs(batch);
  const second = await poolReadyCheck(fixed, opts);
  return {
    ...second,
    batch: fixed,
    repaired: applied.length > 0,
    applied,
    beforeVerdict: first.verdict,
    beforeReasons: first.reasons,
  };
}

export function resetPoolReadyCaches() {
  _discardCache = null;
  _dedupCorpus = null;
  _q2Cache = null;
}
