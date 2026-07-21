'use strict';

/**
 * generationFeedbackSchema.js — learning rules from applied content corrections (PASO 13 P0-2).
 * Separate from content corrections (file patches vs future-generation guidance).
 */

const FEEDBACK_STATUSES = Object.freeze(['candidate', 'approved', 'active', 'deprecated']);

/** Stored `type` values (legacy + current). */
const FEEDBACK_TYPES = Object.freeze([
  'lexical_preference',
  'grammar_rule',
  'naturalness',
  'cefr_warning',
  'exam_quality',
  'typo',
  'other',
]);

/**
 * Human / product categories (P0-2).
 * Maps onto FEEDBACK_TYPES via TYPE_TO_CATEGORY in validateGenerationFeedbackRule.
 */
const FEEDBACK_CATEGORIES = Object.freeze([
  'naturalness',
  'lexical',
  'grammar',
  'cefr',
  'exam_quality',
  'vocabulary',
]);

const FEEDBACK_SEVERITIES = Object.freeze(['low', 'medium', 'high']);

/** Valid status transitions (admin promote workflow). */
const FEEDBACK_TRANSITIONS = Object.freeze({
  candidate: ['approved', 'deprecated'],
  approved: ['active', 'deprecated'],
  active: ['deprecated'],
  deprecated: [], // re-open is P2
});

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function normalizeCategory(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (!s) return '';
  if (s === 'cefr_warning' || s === 'cefr') return 'cefr';
  if (s === 'lexical_preference' || s === 'lexical') return 'lexical';
  if (s === 'grammar_rule' || s === 'grammar') return 'grammar';
  if (s === 'vocabulary' || s === 'vocab') return 'vocabulary';
  if (FEEDBACK_CATEGORIES.includes(s)) return s;
  return s;
}

function typeToDefaultCategory(type) {
  const t = String(type || '');
  if (t === 'naturalness') return 'naturalness';
  if (t === 'lexical_preference') return 'lexical';
  if (t === 'grammar_rule') return 'grammar';
  if (t === 'cefr_warning') return 'cefr';
  if (t === 'exam_quality') return 'exam_quality';
  if (t === 'typo') return 'typo';
  return 'other';
}

/**
 * @param {unknown} raw
 * @param {{ partial?: boolean }} [opts]
 */
function validateGenerationFeedback(raw, opts = {}) {
  const partial = !!opts.partial;
  const errors = [];
  if (!isPlainObject(raw)) return { ok: false, errors: ['body must be an object'] };

  const require = (key, pred, msg) => {
    if (partial && raw[key] === undefined) return;
    if (raw[key] === undefined || raw[key] === null || raw[key] === '') {
      if (!partial) errors.push(`missing_${key}`);
      return;
    }
    if (!pred(raw[key])) errors.push(msg || `invalid_${key}`);
  };

  require('type', (v) => FEEDBACK_TYPES.includes(String(v)), 'invalid_type');
  require('reason', (v) => typeof v === 'string' && String(v).trim().length >= 2, 'invalid_reason');

  if (raw.status !== undefined && !FEEDBACK_STATUSES.includes(String(raw.status))) {
    errors.push('invalid_status');
  }
  if (raw.wrong !== undefined && raw.wrong !== null && typeof raw.wrong !== 'string') {
    errors.push('invalid_wrong');
  }
  if (raw.correct !== undefined && raw.correct !== null && typeof raw.correct !== 'string') {
    errors.push('invalid_correct');
  }
  if (raw.context !== undefined && raw.context !== null && typeof raw.context !== 'string') {
    errors.push('invalid_context');
  }
  if (raw.rule !== undefined && raw.rule !== null && typeof raw.rule !== 'string') {
    errors.push('invalid_rule');
  }
  if (raw.category !== undefined && raw.category !== null && raw.category !== '') {
    const cat = normalizeCategory(raw.category);
    if (!FEEDBACK_CATEGORIES.includes(cat) && cat !== 'typo' && cat !== 'other') {
      errors.push('invalid_category');
    }
  }
  if (raw.severity !== undefined && raw.severity !== null && raw.severity !== '') {
    if (!FEEDBACK_SEVERITIES.includes(String(raw.severity))) errors.push('invalid_severity');
  }
  if (raw.evidence !== undefined && raw.evidence !== null && !Array.isArray(raw.evidence)) {
    errors.push('invalid_evidence');
  }
  if (raw.examples !== undefined && raw.examples !== null && !Array.isArray(raw.examples)) {
    errors.push('invalid_examples');
  }

  if (errors.length) return { ok: false, errors };

  const type = String(raw.type);
  const category =
    raw.category != null && String(raw.category).trim() !== ''
      ? normalizeCategory(raw.category)
      : typeToDefaultCategory(type);

  const value = {
    type,
    wrong: raw.wrong != null ? String(raw.wrong).trim() : '',
    correct: raw.correct != null ? String(raw.correct).trim() : '',
    context: raw.context != null ? String(raw.context).trim() : '',
    reason: String(raw.reason || '').trim(),
    level: raw.level != null ? String(raw.level).trim() : '',
    module: raw.module != null ? String(raw.module).toLowerCase() : '',
    teil: raw.teil != null && Number.isFinite(Number(raw.teil)) ? Number(raw.teil) : null,
    sourceCorrection: raw.sourceCorrection != null ? String(raw.sourceCorrection).trim() : '',
    approvedBy: raw.approvedBy != null ? String(raw.approvedBy).trim() : '',
    status: raw.status ? String(raw.status) : 'candidate',
    avoid: raw.avoid != null ? String(raw.avoid).trim() : '',
    use: raw.use != null ? String(raw.use).trim() : '',
    preferred: raw.preferred != null ? String(raw.preferred).trim() : '',
    pattern: raw.pattern != null ? String(raw.pattern).trim() : '',
    word: raw.word != null ? String(raw.word).trim() : '',
    alternative: raw.alternative != null ? String(raw.alternative).trim() : '',
    learningKind: raw.learningKind != null ? String(raw.learningKind).trim() : '',
    // P0-2 persistent review fields (optional on create; required on activate via gate)
    rule: raw.rule != null ? String(raw.rule).trim() : '',
    category,
    severity: raw.severity && FEEDBACK_SEVERITIES.includes(String(raw.severity))
      ? String(raw.severity)
      : 'medium',
    evidence: Array.isArray(raw.evidence) ? raw.evidence.map((e) => String(e)) : [],
    examples: Array.isArray(raw.examples) ? raw.examples : [],
  };

  if (raw.activatedAt != null) value.activatedAt = String(raw.activatedAt);
  if (raw.activatedBy != null) value.activatedBy = String(raw.activatedBy).trim();
  if (raw.createdFromCorrection != null) {
    value.createdFromCorrection = String(raw.createdFromCorrection).trim();
  } else if (value.sourceCorrection) {
    value.createdFromCorrection = value.sourceCorrection;
  }

  if (partial) {
    const out = {};
    for (const k of Object.keys(value)) {
      if (raw[k] !== undefined) out[k] = value[k];
    }
    // Always allow derived category when type present
    if (raw.category !== undefined) out.category = category;
    if (raw.type !== undefined && raw.category === undefined) out.category = typeToDefaultCategory(type);
    return { ok: true, value: out };
  }
  return { ok: true, value };
}

function canTransition(from, to) {
  const allowed = FEEDBACK_TRANSITIONS[String(from)] || [];
  return allowed.includes(String(to));
}

module.exports = {
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  FEEDBACK_CATEGORIES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_TRANSITIONS,
  validateGenerationFeedback,
  normalizeCategory,
  typeToDefaultCategory,
  canTransition,
};
