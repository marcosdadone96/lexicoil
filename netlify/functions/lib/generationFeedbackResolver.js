'use strict';

/**
 * generationFeedbackResolver.js — PASO 6 observation layer.
 *
 * Resolves reusable generation rules from generationFeedbackStore.
 * Does NOT mutate production prompts — use generationFeedbackPreview() first.
 *
 * Pipeline (future wiring):
 *   getActiveGenerationFeedback → buildGenerationFeedbackContext → append to prompt
 */

const { FEEDBACK_TYPES } = require('./generationFeedbackSchema.js');
const { listFeedback } = require('./generationFeedbackStore.js');

/** Statuses that may affect generation (P0-2: active only; candidate/approved never). */
const GENERATION_STATUSES = Object.freeze(['active']);

const PRIORITY_RANK = Object.freeze({ high: 0, medium: 1, low: 2 });

/** Default cap for production prompts (PASO 7). */
const DEFAULT_MAX_FEEDBACK_RULES = 12;
const FEEDBACK_VERSION = 'v1';
const FEEDBACK_MODES = Object.freeze(['off', 'preview', 'active']);

/**
 * Resolve A/B feedback mode (PASO 8).
 * Priority: explicit feedbackMode → enabled boolean → GENERATION_FEEDBACK_MODE → GENERATION_FEEDBACK_ENABLED → off
 * @param {{ feedbackMode?: string, mode?: string, enabled?: boolean }} [opts]
 * @returns {'off'|'preview'|'active'}
 */
function resolveFeedbackMode(opts = {}) {
  const raw = opts.feedbackMode != null ? opts.feedbackMode : opts.mode;
  if (raw != null && String(raw).trim() !== '') {
    const m = String(raw).trim().toLowerCase();
    if (FEEDBACK_MODES.includes(m)) return m;
  }
  if (opts.enabled === false) return 'off';
  if (opts.enabled === true) return 'active';
  const envMode = String(process.env.GENERATION_FEEDBACK_MODE || '')
    .trim()
    .toLowerCase();
  if (FEEDBACK_MODES.includes(envMode)) return envMode;
  const v = String(process.env.GENERATION_FEEDBACK_ENABLED || '')
    .trim()
    .toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return 'active';
  return 'off';
}

/**
 * Feature flag — off by default.
 * true when mode is preview or active (legacy GENERATION_FEEDBACK_ENABLED still works).
 * @param {boolean|undefined} override — explicit options.generationFeedbackEnabled
 */
function isGenerationFeedbackEnabled(override) {
  if (override === true) return true;
  if (override === false) return false;
  const mode = resolveFeedbackMode({});
  return mode === 'preview' || mode === 'active';
}

function emptyGenerationMetadata(mode = 'off') {
  return {
    usedFeedback: false,
    feedbackRules: [],
    feedbackCount: 0,
    feedbackCategories: [],
    feedbackMode: mode,
    feedbackVersion: FEEDBACK_VERSION,
  };
}

function categoriesFromRules(rules) {
  const set = new Set();
  for (const r of rules || []) {
    const t = String(r.type || r.category || '').toLowerCase();
    if (t === 'lexical' || t === 'lexical_preference' || t === 'vocabulary') set.add('vocabulary');
    else if (t === 'grammar' || t === 'grammar_rule') set.add('grammar');
    else if (t === 'cefr' || t === 'cefr_warning') set.add('CEFR');
    else if (t === 'exam_quality') set.add('exam_quality');
    else if (t === 'naturalness') set.add('naturalness');
    else if (t) set.add(t);
  }
  return [...set];
}

/**
 * Priority order for prompt injection:
 * active high → active medium → active low (fill if under cap)
 * @param {object[]} rules
 * @param {{ maxRules?: number }} [opts]
 */
function selectRulesForPrompt(rules, opts = {}) {
  const max = Math.min(
    Math.max(1, Number(opts.maxRules) || DEFAULT_MAX_FEEDBACK_RULES),
    40,
  );
  const list = Array.isArray(rules) ? [...rules] : [];
  list.sort((a, b) => {
    const sa = statusRank(a.status);
    const sb = statusRank(b.status);
    if (sa !== sb) return sa - sb;
    return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  });

  const preferred = list.filter((r) => r.priority !== 'low');
  const lows = list.filter((r) => r.priority === 'low');
  const out = [];
  for (const r of preferred) {
    if (out.length >= max) break;
    out.push(r);
  }
  // Only fill with low if still under cap
  for (const r of lows) {
    if (out.length >= max) break;
    out.push(r);
  }
  return out;
}

/**
 * Transparent append: original prompt unchanged if mode=off / no rules.
 *
 * Modes (PASO 8):
 * - off: no block, empty metadata
 * - preview: append block, do NOT stamp application metadata (usedFeedback=false)
 * - active: append block + full generationMetadata
 *
 * @param {string} prompt
 * @param {{
 *   rules?: object[],
 *   block?: string,
 *   enabled?: boolean,
 *   feedbackMode?: string,
 *   maxRules?: number,
 *   header?: string,
 * }} [context]
 */
function appendGenerationFeedback(prompt, context = {}) {
  const base = String(prompt || '');
  const mode = resolveFeedbackMode({
    feedbackMode: context.feedbackMode,
    enabled: context.enabled,
  });

  if (mode === 'off') {
    return {
      prompt: base,
      feedbackRulesApplied: 0,
      usedFeedback: false,
      feedbackRuleIds: [],
      generationMetadata: emptyGenerationMetadata('off'),
    };
  }

  let rules = Array.isArray(context.rules) ? context.rules : [];
  rules = selectRulesForPrompt(rules, { maxRules: context.maxRules });

  let block = context.block;
  if (!block) {
    const ctx = buildGenerationFeedbackContext(rules, {
      maxRules: rules.length || 1,
      header: context.header,
    });
    block = ctx.block;
  }

  if (!block || !String(block).trim() || !rules.length) {
    return {
      prompt: base,
      feedbackRulesApplied: 0,
      usedFeedback: false,
      feedbackRuleIds: [],
      generationMetadata: emptyGenerationMetadata(mode),
    };
  }

  const ids = rules.map((r) => r.id).filter(Boolean);
  const categories = categoriesFromRules(rules);
  const nextPrompt = appendFeedbackBlock(base, block);

  if (mode === 'preview') {
    return {
      prompt: nextPrompt,
      feedbackRulesApplied: rules.length,
      usedFeedback: false,
      feedbackRuleIds: ids,
      generationMetadata: {
        ...emptyGenerationMetadata('preview'),
        // Preview: rules influenced the prompt text but are not recorded as applied.
      },
    };
  }

  // active
  return {
    prompt: nextPrompt,
    feedbackRulesApplied: rules.length,
    usedFeedback: true,
    feedbackRuleIds: ids,
    generationMetadata: {
      usedFeedback: true,
      feedbackRules: ids,
      feedbackCount: ids.length || rules.length,
      feedbackCategories: categories,
      feedbackMode: 'active',
      feedbackVersion: FEEDBACK_VERSION,
    },
  };
}

/** Map store types → public rule type labels. */
const TYPE_ALIAS = Object.freeze({
  lexical_preference: 'lexical',
  grammar_rule: 'grammar',
  naturalness: 'naturalness',
  cefr_warning: 'cefr',
  exam_quality: 'exam_quality',
  typo: 'typo',
  other: 'other',
});

const GENERIC_AVOID_RE =
  /^(haus|auto|ja|nein|und|oder|der|die|das|ein|eine|the|a|an|yes|no)$/i;

function normalizeWs(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normKey(s) {
  return normalizeWs(s).toLowerCase();
}

function statusRank(status) {
  if (status === 'active') return 0;
  return 9;
}

/**
 * Infer priority from type + evidence richness.
 * @param {object} rec
 * @returns {'high'|'medium'|'low'}
 */
function inferPriority(rec) {
  if (rec.priority && PRIORITY_RANK[rec.priority] != null) return rec.priority;
  const type = String(rec.type || '');
  const hasPair =
    !!(rec.avoid || rec.wrong) && !!(rec.use || rec.preferred || rec.correct || rec.alternative);
  const hasPattern = !!(rec.pattern && String(rec.pattern).length >= 8);
  if (type === 'grammar_rule' || type === 'cefr_warning') return hasPair || hasPattern ? 'high' : 'medium';
  if (type === 'naturalness' || type === 'exam_quality') return hasPair ? 'high' : 'medium';
  if (type === 'lexical_preference') return hasPair ? 'medium' : 'low';
  return 'low';
}

/**
 * Safety gate: reject typo / vague / over-narrow single-word bans.
 * @param {object} rec — raw feedback record
 * @returns {{ ok: boolean, reason?: string }}
 */
function isSafeForGeneration(rec) {
  if (!rec || typeof rec !== 'object') return { ok: false, reason: 'missing_record' };

  const type = String(rec.type || '');
  if (!FEEDBACK_TYPES.includes(type)) return { ok: false, reason: 'invalid_type' };
  if (type === 'typo') return { ok: false, reason: 'typo_excluded' };
  if (String(rec.learningKind || '').toLowerCase() === 'typo') {
    return { ok: false, reason: 'typo_excluded' };
  }

  const reason = normalizeWs(rec.reason);
  if (reason.length < 4) return { ok: false, reason: 'reason_too_short' };

  const avoid = normalizeWs(rec.avoid || rec.wrong || rec.word || '');
  const prefer = normalizeWs(rec.use || rec.preferred || rec.correct || rec.alternative || '');
  const pattern = normalizeWs(rec.pattern || '');
  const ruleText = normalizeWs(rec.rule || '');

  const hasEvidence = !!(avoid || prefer || pattern || ruleText);
  if (!hasEvidence) return { ok: false, reason: 'no_evidence' };

  // Single generic word ban without prefer/pattern → contamination risk
  if (avoid && !prefer && !pattern && !ruleText) {
    const tokens = avoid.split(/\s+/).filter(Boolean);
    if (tokens.length === 1 && (tokens[0].length <= 4 || GENERIC_AVOID_RE.test(tokens[0]))) {
      return { ok: false, reason: 'over_narrow_avoid' };
    }
  }

  // Pure case-only change without grammar framing → treat as typo-like
  if (avoid && prefer && avoid.toLowerCase() === prefer.toLowerCase() && avoid !== prefer) {
    if (!/caps|capital|groß|klein|grammar|pronoun|verb/i.test(`${reason} ${pattern}`)) {
      return { ok: false, reason: 'case_only_without_grammar_frame' };
    }
  }

  return { ok: true };
}

/**
 * Build a reusable rule object from a store record.
 * @param {object} rec
 * @returns {object|null}
 */
function toReusableRule(rec) {
  const safe = isSafeForGeneration(rec);
  if (!safe.ok) return null;

  const type = TYPE_ALIAS[rec.type] || rec.type;
  const avoid = normalizeWs(rec.avoid || rec.wrong || rec.word || '');
  const prefer = normalizeWs(rec.use || rec.preferred || rec.correct || rec.alternative || '');
  const pattern = normalizeWs(rec.pattern || '');
  const reason = normalizeWs(rec.reason);

  let rule = normalizeWs(rec.rule || '');
  if (!rule) {
    if (pattern) rule = pattern;
    else if (avoid && prefer) rule = `Avoid «${avoid.slice(0, 100)}»; prefer «${prefer.slice(0, 100)}».`;
    else if (avoid) rule = `Avoid «${avoid.slice(0, 120)}».`;
    else if (prefer) rule = `Prefer «${prefer.slice(0, 120)}».`;
    else rule = reason;
  }

  return {
    id: rec.id || null,
    type,
    category: rec.category || type || undefined,
    rule,
    avoid: avoid || undefined,
    prefer: prefer || undefined,
    pattern: pattern || undefined,
    reason,
    priority: inferPriority(rec),
    status: rec.status,
    module: rec.module || '',
    level: rec.level || '',
    teil: rec.teil != null ? Number(rec.teil) : null,
    topic: rec.topic || rec.topicTag || '',
    sourceCorrection: rec.sourceCorrection || rec.createdFromCorrection || '',
    severity: rec.severity || undefined,
  };
}

/**
 * Deduplicate rules by normalized (type + avoid/prefer/rule) key.
 * Prefer active over approved, then higher priority, then newer.
 * @param {object[]} rules
 */
function dedupeRules(rules) {
  const best = new Map();
  for (const r of rules) {
    const key = [
      r.type,
      normKey(r.avoid || ''),
      normKey(r.prefer || ''),
      normKey(r.pattern || ''),
      normKey(r.rule).slice(0, 160),
    ].join('|');
    const prev = best.get(key);
    if (!prev) {
      best.set(key, r);
      continue;
    }
    const betterStatus = statusRank(r.status) < statusRank(prev.status);
    const sameStatus = statusRank(r.status) === statusRank(prev.status);
    const betterPri =
      (PRIORITY_RANK[r.priority] ?? 9) < (PRIORITY_RANK[prev.priority] ?? 9);
    if (betterStatus || (sameStatus && betterPri)) best.set(key, r);
  }
  return [...best.values()].sort((a, b) => {
    const sr = statusRank(a.status) - statusRank(b.status);
    if (sr !== 0) return sr;
    return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  });
}

function matchesQuery(rec, query) {
  const q = query || {};
  if (q.module) {
    const m = String(q.module).toLowerCase();
    const rm = String(rec.module || '').toLowerCase();
    // Empty module on record = global rule (applies everywhere)
    if (rm && rm !== m) return false;
  }
  if (q.level) {
    const lv = String(q.level).toUpperCase();
    const rl = String(rec.level || '').toUpperCase();
    // above_b1 / B1 / empty
    if (rl && rl !== lv && rl !== `ABOVE_${lv}` && !rl.includes(lv)) {
      // allow cefr_warning with level above_b1 when querying B1
      if (!(rl === 'ABOVE_B1' && lv === 'B1')) return false;
    }
  }
  if (q.teil != null && q.teil !== '' && rec.teil != null) {
    if (Number(rec.teil) !== Number(q.teil)) return false;
  }
  if (q.type) {
    const want = String(q.type).toLowerCase();
    const t = String(rec.type || '').toLowerCase();
    const alias = TYPE_ALIAS[t] || t;
    if (t !== want && alias !== want) return false;
  }
  if (q.topic) {
    const topic = normKey(q.topic);
    const blob = normKey(
      `${rec.topic || ''} ${rec.topicTag || ''} ${rec.context || ''} ${rec.reason || ''}`,
    );
    // Topic filter is soft: keep global rules (no topic) + matching topic
    const hasTopicHint = !!(rec.topic || rec.topicTag);
    if (hasTopicHint && !blob.includes(topic)) return false;
  }
  if (q.lang || q.language) {
    const lang = String(q.lang || q.language).toLowerCase();
    const rl = String(rec.lang || rec.language || 'de').toLowerCase();
    if (rl && rl !== lang) return false;
  }
  return true;
}

/**
 * Read active+approved feedback and return reusable rules.
 *
 * @param {object} store — Blobs store (or in-memory test double)
 * @param {{
 *   level?: string,
 *   module?: string,
 *   teil?: number,
 *   topic?: string,
 *   type?: string,
 *   lang?: string,
 *   language?: string,
 *   limit?: number,
 *   feedback?: object[],  // optional preloaded list (skip store)
 * }} query
 * @returns {Promise<{ ok: boolean, rules: object[], skipped: object[], error?: string }>}
 */
async function getActiveGenerationFeedback(store, query = {}) {
  let records = [];
  if (Array.isArray(query.feedback)) {
    records = query.feedback;
  } else {
    if (!store) return { ok: false, error: 'missing_store', rules: [], skipped: [] };
    const listed = await listFeedback(store, {
      status: 'all',
      limit: query.limit || 500,
      module: undefined, // filter ourselves (allow global empty module)
    });
    if (!listed.ok) return { ok: false, error: listed.error, rules: [], skipped: [] };
    records = listed.feedback || [];
  }

  const skipped = [];
  const eligible = [];

  for (const rec of records) {
    if (!GENERATION_STATUSES.includes(rec.status)) {
      skipped.push({ id: rec.id, reason: `status_${rec.status || 'unknown'}` });
      continue;
    }
    if (!matchesQuery(rec, query)) {
      skipped.push({ id: rec.id, reason: 'filtered_query' });
      continue;
    }
    const safe = isSafeForGeneration(rec);
    if (!safe.ok) {
      skipped.push({ id: rec.id, reason: safe.reason });
      continue;
    }
    const rule = toReusableRule(rec);
    if (rule) eligible.push(rule);
    else skipped.push({ id: rec.id, reason: 'not_reusable' });
  }

  const rules = dedupeRules(eligible);
  return { ok: true, rules, skipped, count: rules.length };
}

/**
 * Convert reusable rules into a separate prompt block (never mixed into base template).
 *
 * @param {object[]} rules — from getActiveGenerationFeedback
 * @param {{ header?: string, maxRules?: number }} [opts]
 * @returns {{ block: string, empty: boolean, ruleCount: number }}
 */
function buildGenerationFeedbackContext(rules, opts = {}) {
  const max = Math.min(Number(opts.maxRules) || DEFAULT_MAX_FEEDBACK_RULES, 80);
  const sliced = selectRulesForPrompt(Array.isArray(rules) ? rules : [], { maxRules: max });
  if (!sliced.length) {
    return { block: '', empty: true, ruleCount: 0 };
  }

  const header =
    opts.header ||
    'Additional quality constraints from previous expert reviews:';

  const lines = sliced.map((r) => {
    const bits = [`[${r.type}|${r.priority}]`];
    if (r.rule) bits.push(r.rule);
    else {
      if (r.avoid) bits.push(`Avoid: ${r.avoid}`);
      if (r.prefer) bits.push(`Prefer: ${r.prefer}`);
    }
    return `- ${bits.join(' ')}`;
  });

  const block = [
    '',
    '────────────────────────────────────────',
    'QUALITY RULES FROM PREVIOUS REVIEWS',
    header,
    '',
    ...lines,
    '────────────────────────────────────────',
    '',
  ].join('\n');

  return { block, empty: false, ruleCount: sliced.length };
}

/**
 * Append feedback context as a SEPARATE block after the base prompt.
 * Does not alter the base string beyond concatenation.
 *
 * @param {string} basePrompt
 * @param {string} feedbackBlock
 */
function appendFeedbackBlock(basePrompt, feedbackBlock) {
  const base = String(basePrompt || '');
  const block = String(feedbackBlock || '');
  if (!block.trim()) return base;
  return `${base.replace(/\s+$/, '')}\n\n${block.trim()}\n`;
}

/**
 * Observation-mode preview: base prompt + resolved rules + proposed final prompt.
 * Does NOT call the LLM and does NOT change production generation.
 *
 * @param {{
 *   basePrompt: string,
 *   store?: object,
 *   query?: object,
 *   rules?: object[],
 * }} opts
 */
async function generationFeedbackPreview(opts = {}) {
  const basePrompt = String(opts.basePrompt || '');
  let rules = opts.rules;
  let skipped = [];
  let resolveMeta = null;

  if (!rules) {
    const resolved = await getActiveGenerationFeedback(opts.store, opts.query || {});
    resolveMeta = resolved;
    if (!resolved.ok) {
      return {
        ok: false,
        error: resolved.error,
        basePrompt,
        activeFeedback: [],
        feedbackBlock: '',
        finalPromptPreview: basePrompt,
        skipped: [],
      };
    }
    rules = resolved.rules;
    skipped = resolved.skipped || [];
  }

  const ctx = buildGenerationFeedbackContext(rules, opts.contextOpts);
  const finalPromptPreview = appendFeedbackBlock(basePrompt, ctx.block);

  return {
    ok: true,
    basePrompt,
    activeFeedback: rules,
    feedbackBlock: ctx.block,
    finalPromptPreview,
    ruleCount: ctx.ruleCount,
    skipped,
    resolveMeta: resolveMeta
      ? { count: resolveMeta.count, skipped: resolveMeta.skipped?.length || 0 }
      : null,
    // Human-readable dump for CLI / admin
    report: formatPreviewReport(basePrompt, rules, finalPromptPreview),
  };
}

function formatPreviewReport(basePrompt, rules, finalPrompt) {
  const feedbackLines =
    rules && rules.length
      ? rules.map((r) => `- [${r.type}|${r.priority}] ${r.rule}`).join('\n')
      : '(none)';
  return [
    'BASE PROMPT:',
    basePrompt.slice(0, 2000) + (basePrompt.length > 2000 ? '\n…' : ''),
    '',
    'ACTIVE FEEDBACK:',
    feedbackLines,
    '',
    'FINAL PROMPT PREVIEW:',
    finalPrompt.slice(0, 4000) + (finalPrompt.length > 4000 ? '\n…' : ''),
  ].join('\n');
}

module.exports = {
  GENERATION_STATUSES,
  FEEDBACK_MODES,
  TYPE_ALIAS,
  DEFAULT_MAX_FEEDBACK_RULES,
  FEEDBACK_VERSION,
  resolveFeedbackMode,
  isGenerationFeedbackEnabled,
  selectRulesForPrompt,
  getActiveGenerationFeedback,
  buildGenerationFeedbackContext,
  appendFeedbackBlock,
  appendGenerationFeedback,
  generationFeedbackPreview,
  isSafeForGeneration,
  toReusableRule,
  dedupeRules,
  inferPriority,
  matchesQuery,
  formatPreviewReport,
  emptyGenerationMetadata,
  categoriesFromRules,
};
