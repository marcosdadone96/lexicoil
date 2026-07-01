#!/usr/bin/env node
/** Hard validation: Goethe ads-matching Teil 3 — unique non-zero answer keys. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  validatePartSemanticRules,
  validateUniqueAssignmentKeys,
  validateExamAgainstBlueprint,
} = require(path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'));
const { validateGeneratedExam } = require(path.join(ROOT, 'netlify/functions/lib/examQualityGate.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const blueprint = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B1.json'), 'utf8'),
);
const lesenT3 = blueprint.modules.find((m) => m.id === 'lesen').parts.find((p) => p.teil === 3);

function matchingQs(keys) {
  return keys.map((correct, i) => ({
    id: String(13 + i),
    type: 'matching',
    correct,
    question: `Situation ${13 + i}`,
    options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', '0'],
  }));
}

function mockAdsPart(extra = {}) {
  return {
    teil: 3,
    blueprintSlot: 'ads_matching',
    ads: 'ABCDEFGHIJ'.split('').map((key) => ({ key, title: '', text: `Ad ${key}` })),
    example: {
      number: 0,
      label: 'Beispiel',
      situation: 'Example situation with no matching ad.',
      correct: '0',
    },
    ...extra,
  };
}

const duplicatePart = mockAdsPart({
  questions: matchingQs(['D', 'C', 'E', 'F', '0', 'D', 'C']),
});
const dupSemantic = validatePartSemanticRules(duplicatePart, lesenT3, 'lesen', 3);
assert(
  'duplicate D/C keys => answer_key_not_unique errors',
  dupSemantic.errors.filter((e) => e.startsWith('answer_key_not_unique')).length >= 2,
);

const dupExam = { lang: 'de', level: 'B1', lesenParts: [duplicatePart] };
const dupFidelity = validateExamAgainstBlueprint(dupExam, blueprint);
assert('duplicate Teil 3 fails blueprint fidelity', !dupFidelity.ok);

const zeroRepeatPart = mockAdsPart({
  questions: matchingQs(['A', 'B', 'C', 'D', '0', '0', 'E']),
});
const zeroSemantic = validatePartSemanticRules(zeroRepeatPart, lesenT3, 'lesen', 3);
assert(
  'repeated 0 is allowed',
  zeroSemantic.errors.filter((e) => e.startsWith('answer_key_not_unique')).length === 0,
);

const distinctPart = mockAdsPart({
  questions: matchingQs(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
});
const distinctSemantic = validatePartSemanticRules(distinctPart, lesenT3, 'lesen', 3);
assert('7 distinct keys valid', distinctSemantic.errors.length === 0);

const directKeys = validateUniqueAssignmentKeys(distinctPart.questions, 'lesen:teil=3');
assert('validateUniqueAssignmentKeys empty for distinct', directKeys.length === 0);

const exams = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams/de_B1.json'), 'utf8'));
const transport = exams.find((e) => e.topic === 'transport');
assert('transport exam found in de_B1.json', !!transport);

const transportFidelity = validateExamAgainstBlueprint(transport, blueprint, { examLabel: 'transport' });
assert('transport passes fidelity (unique Lesen T3 keys)', transportFidelity.ok);
assert(
  'transport has no answer_key_not_unique',
  !transportFidelity.errors.some((e) => e.startsWith('answer_key_not_unique')),
);

const transportGate = validateGeneratedExam(transport, { blueprint, strict: true });
assert('validateGeneratedExam marks transport valid', transportGate.valid);

console.log('\nTeil 3 uniqueness tests passed.');
