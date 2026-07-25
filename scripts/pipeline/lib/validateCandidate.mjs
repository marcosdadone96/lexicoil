/**
 * Validate a staging candidate (mini-exam slice + blueprint metadata).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { miniExamFromCandidate } from './candidateBuilder.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const CefrGate = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));
const { loadBlueprintFileSync, BLUEPRINT_INDEX } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));

export function resolveBlueprint(lang, level) {
  const fileId = BLUEPRINT_INDEX[`${lang}_${level}`];
  return fileId ? loadBlueprintFileSync(fileId) : null;
}

export function validateCandidate(candidate, blueprint) {
  const bp = blueprint || resolveBlueprint(candidate.lang, candidate.level);
  const exam = miniExamFromCandidate(candidate);
  const bpPart = bp?.modules
    ?.find((m) => m.id === candidate.module)
    ?.parts?.find((p) => p.teil === candidate.teil);

  // Rubric modules (Writing/Speaking): tasks have no passages nor answer keys, so the
  // exam-level structural checks (exam_missing_modules, exam_no_answer_keys) and the
  // CefrGate passage checks do not apply. Validate the essentials directly instead.
  // (Needed for Cambridge EN, where schreiben/sprechen batches go through staging;
  // Goethe DE never stages these modules, so DE behavior is unchanged.)
  const RUBRIC_MODULES = new Set(['schreiben', 'writing', 'sprechen', 'speaking']);
  if (RUBRIC_MODULES.has(String(candidate.module || '').toLowerCase())) {
    const errors = [];
    const warnings = [];
    const qs = candidate.questions || [];
    if (!qs.length) errors.push('rubric_no_questions');
    if (!bpPart) errors.push('rubric_teil_not_in_blueprint');
    for (const q of qs) {
      const text = String(q.question || q.prompt || '').trim();
      if (!text) errors.push(`rubric_task_text_missing:${q.id || '?'}`);
      else if (text.length < 30) warnings.push(`rubric_task_text_short:${q.id || '?'}`);
      if (!Array.isArray(q.taskTypes) || !q.taskTypes.length) {
        warnings.push(`rubric_missing_taskTypes:${q.id || '?'}`);
      }
    }
    const expectedR = bpPart?.itemsTotal ?? bpPart?.questionsTotal?.min;
    if (expectedR != null && qs.length !== expectedR) {
      warnings.push(`item_count_hint:expected=${expectedR},actual=${qs.length}`);
    }
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      cefr: null,
      blueprintId: bp?.id || null,
      blueprintPart: bpPart
        ? { teil: bpPart.teil, slotType: bpPart.slotType, itemsTotal: expectedR, passageLengthExempt: !!bpPart.passageLengthExempt }
        : null,
    };
  }

  const structural = new ExamValidator().validate(exam, {
    strict: false,
    blueprint: bp,
    cefrGate: false,
    curation: true,
  });

  const cefr = CefrGate.validateExam(exam, {
    lang: candidate.lang,
    level: candidate.level,
    blueprint: bp,
  });

  const errors = [...(structural.errors || [])];
  const warnings = [...(structural.warnings || [])];

  const expected = bpPart?.itemsTotal ?? bpPart?.questionsTotal?.min;
  const actual = candidate.questions?.length || 0;
  if (expected != null && actual !== expected) {
    warnings.push(`item_count_hint:expected=${expected},actual=${actual}`);
  }

  if (!cefr.withinRange) {
    // Lesen T5 = Anzeigen (classified ads / notices): sentences are inherently short and
    // rarely use subordinate clauses — complexity thresholds designed for prose don't apply.
    // Lesen T4 = Leserbriefe/Forum opinions (signText ~25-35 words each): individual opinion
    // snippets are naturally short — avgSentenceLen < 10 is expected and not a quality issue.
    const lesenTeil = candidate.module === 'lesen' ? Number(candidate.teil) : null;
    const isLesenT5 = lesenTeil === 5;
    const isLesenT4 = lesenTeil === 4;
    // Cambridge B1 Reading Part 2 (person_text_matching): eight independent short
    // descriptions — sentences are naturally short/simple, prose complexity gates no aplican.
    const isPersonTextMatching = bpPart?.slotType === 'person_text_matching';
    cefr.reasons.forEach((r) => {
      if ((isLesenT5 || isLesenT4 || isPersonTextMatching) && (r.startsWith('complexity_too_simple') || r.startsWith('subordinate_too_few'))) {
        warnings.push(`cefr_gate:${r} [exento ${isPersonTextMatching ? 'T2-matching' : isLesenT4 ? 'T4-Leserbriefe' : 'T5-Anzeigen'}]`);
      } else {
        errors.push(`cefr_gate:${r}`);
      }
    });
  }

  const passageExempt = bpPart?.passageLengthExempt === true;
  if (passageExempt && cefr.reasons.some((r) => r.startsWith('length_below_min'))) {
    const filtered = errors.filter((e) => !String(e).includes('length_below_min') && !String(e).startsWith('cefr_gate:length_below_min'));
    errors.length = 0;
    errors.push(...filtered);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    cefr,
    blueprintId: bp?.id || null,
    blueprintPart: bpPart
      ? { teil: bpPart.teil, slotType: bpPart.slotType, itemsTotal: expected, passageLengthExempt: !!bpPart.passageLengthExempt }
      : null,
  };
}
