#!/usr/bin/env node
/**
 * Proves T3 ads exist in raw make-t3 batch but were missing on part.ads[] until coalesce.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const PF = require('../js/engine/personalLesenPoolFallback.js');
const { validateGeneratedExam } = require('../netlify/functions/lib/examQualityGate.js');
const { validateExamAgainstBlueprint } = require('../js/engine/validation/blueprintFidelity.js');
const { loadBlueprintFile } = require('../netlify/functions/lib/hybridExamChunkPrompt.js');

const samplePath = path.join(ROOT, 'batches/generated/lesen-t3-auto-csyavv.json');
const batch = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
const blueprint = loadBlueprintFile('de', 'B1');

assert.equal(batch.ads, undefined, 'raw make-t3 batch has no top-level ads[]');
assert.equal(batch.questions[0].options.length, 10, 'raw batch embeds 10 ads in question options');

const poolRecord = {
  id: 'test-t3',
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 3,
  questions: batch.questions,
  ads: batch.ads,
};
const partBefore = JSON.parse(JSON.stringify(PF.reusablePartToLesenPart({ ...poolRecord, questions: batch.questions })));
// Simulate old path: skip coalesce in reusablePartToLesenPart by building manually
const legacyPart = {
  teil: 3,
  slotType: 'ads_matching',
  items: batch.questions.map((q) => ({
    id: q.id,
    signText: q.question,
    type: 'matching',
    correct: q.correct,
    options: q.options,
  })),
};
assert.ok(!legacyPart.ads?.length, 'legacy convert: part.ads empty');

const examLegacy = {
  lang: 'de',
  level: 'B1',
  goetheFormat: true,
  vocabPersonal: true,
  lesenParts: [legacyPart],
};
const fidelityBefore = validateExamAgainstBlueprint(examLegacy, blueprint, { partialExam: true });
assert.ok(
  (fidelityBefore.errors || []).some((e) => e.includes('ads_count_mismatch')),
  `expected ads_count before repair, got: ${fidelityBefore.errors?.join('; ')}`,
);

PF.coalesceLesenAdsMatchingPart(legacyPart);
assert.equal(legacyPart.ads?.length, 10, 'after coalesce: 10 ads');
assert.ok(legacyPart.example?.correct === '0', 'Beispiel inserted');

const examFixed = {
  lang: 'de',
  level: 'B1',
  goetheFormat: true,
  vocabPersonal: true,
  lesenParts: [legacyPart],
};
const gateAfter = validateGeneratedExam(examFixed, { blueprint, partialExam: true });
assert.equal(
  gateAfter.valid,
  true,
  `expected valid after repair, errors: ${(gateAfter.errors || []).join('; ')}`,
);

assert.equal(partBefore.ads?.length, 10, 'reusablePartToLesenPart now includes ads');
console.log('✓ raw make-t3 has 10 embedded ads (not Gemini — deterministic make-t3)');
console.log('✓ legacy convert lost part.ads[] → ads_count_mismatch');
console.log('✓ coalesceLesenAdsMatchingPart repairs → validation passes');
console.log('✓ reusablePartToLesenPart auto-coalesces');
