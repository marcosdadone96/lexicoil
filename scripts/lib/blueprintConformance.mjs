/**
 * Blueprint slot conformance — blocks bank ingest of questions that don't fit their Teil.
 * Type rules mirror ExamBlueprint.typeAllowed (what assemble actually uses).
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));

const MODULE_ALIASES = {
  reading: 'lesen',
  listening: 'horen',
  writing: 'schreiben',
  speaking: 'sprechen',
  use_of_english: 'grammatik',
  grammar: 'grammatik',
};

/** Canonical type token (aligned with ExamBlueprint.normType + ExamValidator aliases). */
export function normalizeQuestionType(raw) {
  const t = String(raw || '').toLowerCase().trim();
  if (t === 'multiple') return 'multiple_choice';
  if (t === 'match') return 'matching';
  if (['rf', 'tf', 'true_false', 'richtig_falsch', 'rfn', 'r_f_n'].includes(t)) return 'true_false';
  if (['jn', 'yn', 'ja_nein'].includes(t)) return 'ja_nein';
  if (['mc', 'mcq', 'multiple_choice', 'abcd'].includes(t)) return 'multiple_choice';
  if (['person_match', 'person_multi', 'matching_speaker'].includes(t)) return 'matching';
  if (['gap', 'gap_fill'].includes(t)) return 'gap_fill';
  if (
    [
      'short',
      'short_answer',
      'rubric',
      'schreiben',
      'writing',
      'planungsaufgabe',
      'praesentation',
      'praesentationsaufgabe',
      'feedback',
      'feedback_diskussion',
      'feedback_und_fragen',
      'diskussion',
    ].includes(t)
  ) {
    return 'short_answer';
  }
  return t;
}

function normalizeModuleId(module) {
  const m = String(module || '').toLowerCase();
  return MODULE_ALIASES[m] || m;
}

function findBlueprintPart(q, blueprint) {
  const modId = normalizeModuleId(q.module);
  const mod = (blueprint.modules || []).find((m) => m.id === modId);
  if (!mod) return null;
  const teil = typeof q.teil === 'string' ? Number(q.teil) : q.teil;
  const part = (mod.parts || []).find((p) => p.teil === teil);
  if (!part) return null;
  return { mod, part };
}

function hasNonEmptyOptions(q) {
  const opts = q.options ?? q.matchLabels;
  return Array.isArray(opts) && opts.length > 0;
}

function hasCorrect(q) {
  const c = q.correct ?? q.correctAnswer;
  return c != null && c !== '';
}

function effectiveType(q) {
  return normalizeQuestionType(q.questionType || q.type);
}

function typeAllowedForSlot(q, allowed) {
  const t = effectiveType(q);
  return ExamBlueprint.typeAllowed({ ...q, type: t, questionType: t }, allowed);
}

/**
 * @param {object} q
 * @param {object} blueprint
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function checkQuestionConformance(q, blueprint) {
  const reasons = [];
  const slot = findBlueprintPart(q, blueprint);
  if (!slot) {
    reasons.push('slot_not_in_blueprint');
    return { ok: false, reasons };
  }

  const { part } = slot;
  const allowed = part.questionTypes || [];
  const type = effectiveType(q);

  if (!typeAllowedForSlot(q, allowed)) {
    reasons.push(`type_not_allowed:${type}:allowed=${allowed.join(',')}`);
  }

  if (type === 'matching' && typeAllowedForSlot(q, allowed)) {
    if (!hasNonEmptyOptions(q)) reasons.push('matching_missing_options');
  }

  if (type === 'multiple_choice' && typeAllowedForSlot(q, allowed)) {
    if (!hasNonEmptyOptions(q)) reasons.push('options_missing');
    if (!hasCorrect(q)) reasons.push('correct_missing');
  }

  if ((type === 'true_false' || type === 'ja_nein') && typeAllowedForSlot(q, allowed)) {
    if (!hasCorrect(q)) reasons.push('correct_missing');
  }

  if (type === 'short_answer' && typeAllowedForSlot(q, allowed)) {
    if (!q.question && !q.prompt && !q.task) reasons.push('prompt_missing');
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * @param {{ questions?: object[] }} batch
 * @param {object} blueprint
 * @returns {{ ok: boolean, items: { id: string, ok: boolean, reasons: string[] }[] }}
 */
export function checkBatchConformance(batch, blueprint) {
  const items = (batch.questions || []).map((q) => {
    const result = checkQuestionConformance(q, blueprint);
    return { id: q.id || '(no-id)', ok: result.ok, reasons: result.reasons };
  });
  return { ok: items.every((i) => i.ok), items };
}
