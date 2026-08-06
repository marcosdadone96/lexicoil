'use strict';

/**
 * validateGenerationFeedbackRule.js — PASO 8 quality gate before promoting rules to active.
 * Does not mutate store records; returns accepted true/false + reasons.
 */

const { FEEDBACK_TYPES } = require('./generationFeedbackSchema.js');

/** Categories allowed to affect generation (activation gate). */
const ALLOWED_ACTIVATION_CATEGORIES = Object.freeze([
  'grammar',
  'vocabulary',
  'lexical',
  'naturalness',
  'cefr',
  'CEFR',
  'exam_quality',
]);

const TYPE_TO_CATEGORY = Object.freeze({
  grammar_rule: 'grammar',
  lexical_preference: 'lexical',
  naturalness: 'naturalness',
  cefr_warning: 'cefr',
  exam_quality: 'exam_quality',
  typo: 'typo',
  other: 'other',
  grammar: 'grammar',
  lexical: 'lexical',
  vocabulary: 'vocabulary',
  cefr: 'cefr',
  CEFR: 'cefr',
});

const GENERIC_WORD_RE =
  /^(haus|auto|ja|nein|und|oder|der|die|das|ein|eine|the|a|an|yes|no|perfekt|präsens|sein|haben)$/i;

const OVERBROAD_RE =
  /\b(siempre|never|always|evitar siempre|nunca usar|ban all|prohibido siempre|no usar\s+\w+\s*$)/i;

function normalizeWs(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function onlyCaseChange(a, b) {
  const s = normalizeWs(a);
  const t = normalizeWs(b);
  return s.toLowerCase() === t.toLowerCase() && s !== t;
}

function resolveCategory(rec) {
  const raw = String(rec.category || rec.learningKind || rec.type || '').trim();
  if (TYPE_TO_CATEGORY[raw]) return TYPE_TO_CATEGORY[raw];
  if (TYPE_TO_CATEGORY[raw.toLowerCase()]) return TYPE_TO_CATEGORY[raw.toLowerCase()];
  return raw.toLowerCase() || 'other';
}

function collectEvidence(rec) {
  const examples = [];
  const sourceIds = [];
  if (rec.sourceCorrection) sourceIds.push(String(rec.sourceCorrection));
  if (rec.createdFromCorrection) sourceIds.push(String(rec.createdFromCorrection));
  if (Array.isArray(rec.sourceCorrections)) {
    for (const id of rec.sourceCorrections) if (id) sourceIds.push(String(id));
  }
  if (Array.isArray(rec.sourceIds)) {
    for (const id of rec.sourceIds) if (id) sourceIds.push(String(id));
  }
  if (Array.isArray(rec.evidence)) {
    for (const e of rec.evidence) if (e) sourceIds.push(String(e));
  }
  const avoid = normalizeWs(rec.avoid || rec.wrong || rec.word || '');
  const prefer = normalizeWs(rec.use || rec.preferred || rec.correct || rec.alternative || '');
  const pattern = normalizeWs(rec.pattern || '');
  const rule = normalizeWs(rec.rule || '');
  if (avoid || prefer) {
    examples.push({ avoid: avoid || undefined, prefer: prefer || undefined });
  }
  if (pattern) examples.push({ pattern });
  if (rule && !avoid && !prefer) examples.push({ rule });
  if (Array.isArray(rec.examples)) {
    for (const ex of rec.examples) {
      if (ex && typeof ex === 'object') examples.push(ex);
      else if (ex) examples.push({ text: String(ex) });
    }
  }
  const associatedCount = Math.max(
    Number(rec.associatedCorrectionCount) || 0,
    Number(rec.correctionCount) || 0,
    sourceIds.length,
    examples.length > 0 ? 1 : 0,
  );
  return { examples, sourceIds: [...new Set(sourceIds)], associatedCount, avoid, prefer, pattern, rule };
}

/**
 * @param {object} rec — feedback record or reusable rule
 * @param {{ minAssociated?: number, requireRule?: boolean }} [opts]
 */
function validateGenerationFeedbackRule(rec, opts = {}) {
  const reasons = [];
  const warnings = [];
  if (!rec || typeof rec !== 'object') {
    return {
      accepted: false,
      category: 'other',
      reasons: ['missing_record'],
      warnings,
      evidence: {},
    };
  }

  const category = resolveCategory(rec);
  const allowedNorm = ALLOWED_ACTIVATION_CATEGORIES.map((c) => String(c).toLowerCase());
  if (!allowedNorm.includes(String(category).toLowerCase())) {
    reasons.push(`category_not_allowed:${category}`);
  }

  const type = String(rec.type || '');
  if (type && !FEEDBACK_TYPES.includes(type) && !TYPE_TO_CATEGORY[type]) {
    reasons.push(`invalid_type:${type}`);
  }
  if (type === 'typo' || category === 'typo') {
    reasons.push('typo_not_activatable');
  }
  if (type === 'other' || category === 'other') {
    reasons.push('other_not_activatable');
  }

  const ruleText = normalizeWs(rec.rule || '');
  const requireRule = opts.requireRule === true;
  if (requireRule) {
    if (ruleText.length < 12) {
      reasons.push('missing_or_short_rule');
    }
  }

  const description = normalizeWs(rec.reason || rec.rule || rec.pattern || '');
  if (description.length < 8) {
    reasons.push('description_too_short');
  } else if (description.length < 16) {
    warnings.push('description_thin');
  }

  const evidence = collectEvidence(rec);
  const minAssociated = opts.minAssociated != null ? Number(opts.minAssociated) : 1;
  if (evidence.associatedCount < minAssociated) {
    reasons.push('insufficient_evidence');
  }
  if (!evidence.examples.length && !evidence.pattern && !evidence.rule && !ruleText) {
    reasons.push('missing_examples');
  }
  if (!evidence.sourceIds.length && evidence.associatedCount < 2) {
    warnings.push('no_source_ids');
  }

  // Case-only (capitalization) without pedagogical framing
  if (onlyCaseChange(rec.wrong || rec.avoid || '', rec.correct || rec.use || rec.preferred || '')) {
    const framed = /caps|capital|großschreibung|kleinschreibung|grammar|mayúsc|casing/i.test(
      `${rec.reason || ''} ${rec.rule || ''} ${rec.pattern || ''}`,
    );
    if (!framed) reasons.push('case_only_not_activatable');
  }

  // Over-narrow / generic
  if (evidence.avoid && !evidence.prefer && !evidence.pattern) {
    const tokens = evidence.avoid.split(/\s+/).filter(Boolean);
    if (tokens.length === 1 && (tokens[0].length <= 5 || GENERIC_WORD_RE.test(tokens[0]))) {
      reasons.push('over_narrow_or_generic_avoid');
    }
  }
  if (OVERBROAD_RE.test(description) || OVERBROAD_RE.test(evidence.rule) || OVERBROAD_RE.test(ruleText)) {
    reasons.push('overbroad_prohibition');
  }
  if (
    /perfekt|präsens|präteritum|futur/i.test(evidence.avoid || description) &&
    /immer|siempre|always|nunca|never/i.test(description)
  ) {
    reasons.push('overbroad_tense_ban');
  }

  const useful =
    /colocaci[oó]n|collocation|literal|traducc|natural|preposici|verb.?prep|goethe|distractor|B1|idiomat|eintreten|einführen/i.test(
      `${description} ${ruleText}`,
    );
  if (useful) warnings.push('looks_reusable');

  return {
    accepted: reasons.length === 0,
    category,
    reasons,
    warnings,
    evidence: {
      associatedCount: evidence.associatedCount,
      sourceIds: evidence.sourceIds,
      exampleCount: evidence.examples.length,
      examples: evidence.examples.slice(0, 5),
    },
  };
}

module.exports = {
  ALLOWED_ACTIVATION_CATEGORIES,
  TYPE_TO_CATEGORY,
  validateGenerationFeedbackRule,
  resolveCategory,
  collectEvidence,
  onlyCaseChange,
};
