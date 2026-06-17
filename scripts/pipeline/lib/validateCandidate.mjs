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
    cefr.reasons.forEach((r) => errors.push(`cefr_gate:${r}`));
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
