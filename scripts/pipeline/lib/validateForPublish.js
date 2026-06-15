/**
 * Publish gate — ExamValidator(strict) + CefrGate (mandatory for Strategy B curation).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const CefrGate = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));
const { loadBlueprintFileSync, BLUEPRINT_INDEX } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));

export function resolveBlueprint(lang, level) {
  const key = `${lang}_${level}`;
  const { BLUEPRINT_INDEX, loadBlueprintFileSync } = require(path.join(
    ROOT,
    'js/engine/validation/blueprintResolver.js',
  ));
  const fileId = BLUEPRINT_INDEX[key];
  return fileId ? loadBlueprintFileSync(fileId) : null;
}

export function validateForPublish(exam, { lang, level, blueprint = undefined, useBlueprint = true } = {}) {
  const lg = lang || exam?.lang || 'de';
  const lv = level || exam?.level || 'B1';
  const bp = useBlueprint ? blueprint ?? resolveBlueprint(lg, lv) : false;

  const structural = new ExamValidator().validate(exam, {
    strict: true,
    blueprint: bp,
    cefrGate: true,
    curation: true,
  });

  const cefr = CefrGate.validateExam(exam, { lang: lg, level: lv });
  const errors = [...(structural.errors || [])];
  if (!cefr.withinRange) {
    cefr.reasons.forEach((r) => {
      const code = `cefr_gate:${r}`;
      if (!errors.includes(code)) errors.push(code);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: structural.warnings || [],
    cefr,
    blueprintId: bp?.id || bp?.examType || null,
  };
}
