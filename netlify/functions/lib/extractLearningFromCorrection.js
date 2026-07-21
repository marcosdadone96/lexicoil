'use strict';

/**
 * extractLearningFromCorrection.js — decide if an applied correction yields reusable feedback.
 * Heuristics only (PASO 5 infra). Prompt integration comes later.
 */

const { FEEDBACK_TYPES } = require('./generationFeedbackSchema.js');

function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch (_) {
    return String(v);
  }
}

function normalizeWs(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function onlyCaseChange(a, b) {
  return normalizeWs(a).toLowerCase() === normalizeWs(b).toLowerCase() && normalizeWs(a) !== normalizeWs(b);
}

function editDistanceRatio(a, b) {
  const s = normalizeWs(a);
  const t = normalizeWs(b);
  if (!s && !t) return 0;
  if (!s || !t) return 1;
  const m = s.length;
  const n = t.length;
  if (Math.max(m, n) > 200) {
    // cheap approx for long strings
    return s === t ? 0 : 0.5;
  }
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n] / Math.max(m, n);
}

/**
 * @param {object} correction — applied correction record
 * @returns {{ reusable: boolean, kind: string, feedback?: object, skipReason?: string }}
 */
function extractLearningFromCorrection(correction) {
  if (!correction || typeof correction !== 'object') {
    return { reusable: false, kind: 'other', skipReason: 'missing_correction' };
  }

  const reason = String(correction.reason || '').toLowerCase();
  const comment = String(correction.comment || '').toLowerCase();
  const fieldPath = String(correction.fieldPath || '');
  const oldT = asText(correction.oldValue);
  const newT = asText(correction.newValue);
  const blob = `${reason} ${comment}`;

  // Pure typo / tiny edit → no learning rule
  const dist = editDistanceRatio(oldT, newT);
  const isTiny =
    oldT.length < 40 &&
    newT.length < 40 &&
    dist > 0 &&
    dist <= 0.2 &&
    !/natural|grammar|cefr|goethe|distractor|literal|plausib/i.test(blob);

  if (isTiny || /\btypo\b|ortograf|schreibfehler|tippfehler/.test(blob)) {
    if (dist <= 0.25 || /\btypo\b|ortograf|schreibfehler|tippfehler/.test(blob)) {
      return {
        reusable: false,
        kind: 'typo',
        skipReason: 'simple_typo',
        feedback: {
          type: 'typo',
          wrong: oldT.slice(0, 200),
          correct: newT.slice(0, 200),
          reason: correction.reason || 'typo',
          learningKind: 'typo',
        },
      };
    }
  }

  let type = 'other';
  let learningKind = 'other';
  const feedback = {
    wrong: oldT.slice(0, 500),
    correct: newT.slice(0, 500),
    context: `${correction.module || ''} T${correction.teil || ''} · ${fieldPath}`.trim(),
    reason: correction.reason || 'content correction',
    level: 'B1',
    module: correction.module || '',
    teil: correction.teil != null ? Number(correction.teil) : null,
    sourceCorrection: correction.id || '',
  };

  if (onlyCaseChange(oldT, newT) || /caps|capital|großschreibung|kleinschreibung|glaube/.test(blob)) {
    type = 'grammar_rule';
    learningKind = 'grammar';
    feedback.pattern = 'German capitalization / verb after pronoun casing';
    feedback.avoid = oldT.slice(0, 120);
    feedback.use = newT.slice(0, 120);
  } else if (/cefr|above.?b1|too (hard|advanced)|zu (schwer|hoch)|b2|c1/.test(blob)) {
    type = 'cefr_warning';
    learningKind = 'CEFR';
    feedback.word = oldT.slice(0, 80);
    feedback.alternative = newT.slice(0, 80);
    feedback.level = 'above_b1';
  } else if (/natural|ungelenk|unidiomat|nicht idiomat|awkward|goethe|distractor|plausib|literal|explanation/.test(blob)) {
    if (/distractor|plausib|literal|explanation|frage|option/.test(blob) || /options|explanation|correct|question/.test(fieldPath)) {
      type = 'exam_quality';
      learningKind = 'exam quality';
    } else {
      type = 'naturalness';
      learningKind = 'naturalness';
    }
    feedback.avoid = oldT.slice(0, 200);
    feedback.preferred = newT.slice(0, 200);
  } else if (/vocab|wortschatz|lexical|kollok|präposition|preposition|auf\b|von\b/.test(blob) || fieldPath === 'text' || fieldPath === 'question') {
    type = 'lexical_preference';
    learningKind = 'vocabulary';
    feedback.avoid = oldT.slice(0, 120);
    feedback.use = newT.slice(0, 120);
  } else if (dist > 0.15) {
    type = 'naturalness';
    learningKind = 'naturalness';
    feedback.avoid = oldT.slice(0, 200);
    feedback.preferred = newT.slice(0, 200);
  } else {
    return { reusable: false, kind: 'other', skipReason: 'not_reusable', feedback: { ...feedback, type: 'other' } };
  }

  if (!FEEDBACK_TYPES.includes(type)) type = 'other';
  feedback.type = type;
  feedback.learningKind = learningKind;
  feedback.status = 'candidate';

  // P0-2 draft fields for admin review (never auto-active)
  const { typeToDefaultCategory } = require('./generationFeedbackSchema.js');
  feedback.category = typeToDefaultCategory(type);
  feedback.severity = type === 'cefr_warning' || type === 'grammar_rule' ? 'high' : 'medium';
  feedback.rule = buildDraftRule(type, feedback);
  feedback.evidence = [
    correction.sourceFile || '',
    correction.id || '',
  ].filter(Boolean);
  feedback.examples = [
    {
      avoid: feedback.avoid || feedback.wrong || '',
      prefer: feedback.preferred || feedback.use || feedback.correct || '',
    },
  ].filter((ex) => ex.avoid || ex.prefer);
  feedback.createdFromCorrection = correction.id || '';

  return { reusable: true, kind: learningKind, feedback };
}

function buildDraftRule(type, feedback) {
  const avoid = String(feedback.avoid || feedback.wrong || '').slice(0, 120);
  const prefer = String(feedback.preferred || feedback.use || feedback.correct || '').slice(0, 120);
  if (type === 'naturalness' && avoid && prefer) {
    return `Avoid unnatural phrasing like "${avoid.slice(0, 60)}…"; prefer "${prefer.slice(0, 60)}…" in Goethe B1 texts.`;
  }
  if (type === 'lexical_preference' && avoid && prefer) {
    return `Prefer lexical choice "${prefer.slice(0, 40)}" over "${avoid.slice(0, 40)}" in this context.`;
  }
  if (type === 'grammar_rule') {
    return feedback.pattern || `Apply German grammar/casing consistently (avoid "${avoid.slice(0, 40)}").`;
  }
  if (type === 'cefr_warning') {
    return `Keep vocabulary at B1; avoid above-B1 wording like "${(feedback.word || avoid).slice(0, 40)}".`;
  }
  if (type === 'exam_quality') {
    return `Improve exam quality: avoid weak distractors/literal copies; prefer clear Goethe-style items.`;
  }
  return String(feedback.reason || 'Reusable content guidance').slice(0, 200);
}

module.exports = {
  extractLearningFromCorrection,
  editDistanceRatio,
  onlyCaseChange,
};
