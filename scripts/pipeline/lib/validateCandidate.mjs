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
    const isSentenceInsertion =
      bpPart?.taskFormat === 'sentence_insertion' || bpPart?.slotType === 'sentence_gap_fill';
    const isB2OpinionHeadline =
      bpPart?.taskFormat === 'opinion_headline_matching' || bpPart?.slotType === 'opinion_headline_matching';
    const isB2RulesMatching =
      bpPart?.taskFormat === 'paragraph_heading_matching' || bpPart?.slotType === 'rules_matching';
    cefr.reasons.forEach((r) => {
      if ((isLesenT5 || isLesenT4) && (r.startsWith('complexity_too_simple') || r.startsWith('subordinate_too_few'))) {
        warnings.push(`cefr_gate:${r} [exento ${isLesenT4 ? 'T4-Leserbriefe' : 'T5-Anzeigen'}]`);
      } else if (isSentenceInsertion && r.startsWith('inference_below_min')) {
        warnings.push(`cefr_gate:${r} [exento T2-Sätze einfügen]`);
      } else if (isB2OpinionHeadline && r.startsWith('inference_below_min')) {
        warnings.push(`cefr_gate:${r} [exento B2-T4-Meinung↔Überschrift]`);
      } else if (isB2RulesMatching && r.startsWith('inference_below_min')) {
        warnings.push(`cefr_gate:${r} [exento B2-T5-Studienordnung↔Überschriften]`);
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
