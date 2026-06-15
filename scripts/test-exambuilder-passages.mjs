#!/usr/bin/env node
/** Regression: ExamBuilder preserves passage text and item counts from blueprint assembly */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const bank = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/de/B1/questions.json'), 'utf8'),
);
const blueprint = loadBlueprintFileSync('goethe_B1');
ExamBlueprint.cacheBlueprint('de', 'B1', blueprint);

const assembled = ExamBlueprint.assemble(bank, blueprint);
const exam = ExamBuilder.buildFromBlueprint('de', 'B1', bank, blueprint, {
  mode: 'standard',
  assembled,
});

assert(exam.lesenParts?.length >= 1, 'lesen parts assembled');
const teil1 = exam.lesenParts.find((p) => p.teil === 1) || exam.lesenParts[0];
assert(PassageResolver.partHasReadingText(teil1), 'lesen teil 1 has reading text');
assert(
  (teil1.items || []).every((it) => (it.signText || '').length > 20),
  'items layout signText is passage not question stub',
);

const teil2 = exam.lesenParts.find((p) => p.teil === 2);
const teilPassage = exam.lesenParts.find((p) => p.teil === 3 || (p.questions?.length && p.text?.trim()));
if (teil2) {
  const hasContent =
    (teil2.items?.length || 0) >= 1 ||
    (teil2.questions?.length || 0) >= 1 ||
    !!teil2.text?.trim();
  assert(hasContent, 'lesen teil 2 has items or passage content');
}
if (teilPassage?.text) {
  assert(!!teilPassage.text.trim(), 'lesen passage part has shared passage text');
  assert((teilPassage.questions?.length || 0) >= 1, 'lesen passage part has questions');
}

const horen1 = exam.horenParts?.[0];
assert(horen1 && PassageResolver.partHasListeningTranscript(horen1), 'horen part has transcript');

const envPassage = bank.passages.find((p) => p.id === 'de-b1-p-env');
const signTexts = (teil1.items || []).map((it) => it.signText).filter(Boolean);
assert(
  signTexts.some((t) => t.includes('Stadtgärten') || t === envPassage?.text),
  'passage text embedded in items',
);

const basic = new ExamValidator().validate(exam);
assert(basic.valid, `basic validation passes (${basic.errors.join(', ')})`);

console.log('\nExamBuilder passage regression tests passed.');
