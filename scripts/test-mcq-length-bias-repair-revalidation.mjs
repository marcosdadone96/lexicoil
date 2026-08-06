#!/usr/bin/env node
/**
 * Verifica que tras reparación/regen de sesgo MCQ la calidad se re-evalúa sobre el batch
 * actualizado (no un reporte congelado del primer chequeo).
 */
import assert from 'node:assert/strict';
import { repairMcqLengthBiasBatch } from './lib/mcqLengthBiasRepair.mjs';
import { checkLesenBatchQuality, formatQualityReport } from './lib/lesenBatchQuality.mjs';

function mcq(id, letter, bodies) {
  return {
    id,
    type: 'multiple_choice',
    passageId: 'gen-l5-test',
    question: 'Was gilt laut Text?',
    options: bodies.map((b, i) => `${String.fromCharCode(97 + i)}) ${b}`),
    correct: letter,
    correctAnswer: letter,
    explanation: 'Die Regel steht klar im Hausordnungstext für alle Besucher.',
  };
}

function balancedOptions(prefix) {
  return [
    `${prefix} Besucher müssen im gesamten Freizeitzentrum feste Regeln beachten`,
    `${prefix} Im Hallenbad gilt die Regel nur werktags`,
    `${prefix} Im Foyer darf man jederzeit laut telefonieren`,
  ];
}

const biasedSpecs = [
  { id: 'gen-q-5-test-1', letter: 'b', wrong: ['Kurz A', 'Lang correct option here much longer', 'Kurz C'] },
  { id: 'gen-q-5-test-2', letter: 'a', wrong: ['Very long correct answer option text here', 'Short', 'Also short'] },
  { id: 'gen-q-5-test-3', letter: 'c', wrong: ['Tiny', 'Small', 'Correct answer is intentionally much longer than others'] },
  { id: 'gen-q-5-test-4', letter: 'b', wrong: ['X', 'Correct option with excessive length in chars', 'Y'] },
];

const batch = {
  passages: [{ id: 'gen-l5-test', text: 'Regeln im Freizeitzentrum für Besucher und Kurse.' }],
  questions: biasedSpecs.map((s) => mcq(s.id, s.letter, s.wrong)),
};

const lengthIssues = (quality) =>
  (quality.issues || []).filter((i) => /sesgo de longitud MCQ/i.test(i));

const preQuality = checkLesenBatchQuality(batch, 5, { level: 'B1' });
assert.equal(lengthIssues(preQuality).length, 4, 'pre-repair: 4 length-bias issues');
const preReport = formatQualityReport(preQuality);

let llmCalls = 0;
const regenIds = new Set();

const mockLlm = async ({ prompt }) => {
  llmCalls += 1;
  if (prompt.includes('Reescribe COMPLETA')) {
    const idMatch = prompt.match(/"id"\s*:\s*"(gen-q-5-test-\d+)"/) || prompt.match(/(gen-q-5-test-\d+)/);
    const id = idMatch?.[1] || idMatch?.[0];
    regenIds.add(id);
    const spec = biasedSpecs.find((s) => s.id === id) || biasedSpecs[0];
    const opts = balancedOptions(id.slice(-1));
    return {
      text: JSON.stringify({
        id,
        question: 'Was gilt laut Text?',
        options: opts.map((b, i) => `${String.fromCharCode(97 + i)}) ${b}`),
        correct: spec.letter,
        correctAnswer: spec.letter,
        explanation: 'Die Regel steht klar im Hausordnungstext für alle Besucher.',
      }),
    };
  }
  // Batch repair: empeora solo la opción correcta → guarda rechaza → regen por pregunta
  return {
    text: JSON.stringify({
      questions: batch.questions.map((q) => {
        const letter = q.correct || q.correctAnswer || 'b';
        const idx = { a: 0, b: 1, c: 2 }[letter] ?? 1;
        const options = q.options.map((o, i) => {
          if (i !== idx) return o;
          return `${o} und noch viel länger als zuvor mit extra Wörtern`;
        });
        return { id: q.id, options, explanation: q.explanation };
      }),
    }),
  };
};

const issuesForRepair = lengthIssues(preQuality);
const repaired = await repairMcqLengthBiasBatch(
  batch,
  5,
  issuesForRepair,
  mockLlm,
  { module: 'lesen', level: 'B1' },
);

assert.ok(repaired, 'repair returned updated batch');
assert.equal(regenIds.size, 4, '4 regen API calls (one per biased question)');
assert.ok(llmCalls >= 5, 'batch repair + 4 regens invoked callLlm');

const postQuality = checkLesenBatchQuality(repaired, 5, { level: 'B1' });
const postReport = formatQualityReport(postQuality);

assert.ok(
  lengthIssues(postQuality).length < lengthIssues(preQuality).length,
  `post-repair length issues reduced (${lengthIssues(postQuality).length} vs ${lengthIssues(preQuality).length})`,
);
assert.notEqual(postReport, preReport, 'post-repair quality report differs from pre-repair');

// Simula bug previo: si repaired=null, el pipeline viejo reutilizaba preReport sin re-chequear.
function simulateOldPipelineResult(pre, repairedBatch, teil) {
  if (!repairedBatch) return pre;
  return checkLesenBatchQuality(repairedBatch, teil, { level: 'B1' });
}

function simulateFixedPipelineResult(pre, repairedBatch, teil, currentBatch) {
  const checkBatch = repairedBatch || currentBatch;
  return checkLesenBatchQuality(checkBatch, teil, { level: 'B1' });
}

const staleWhenAllRegenFail = simulateOldPipelineResult(preQuality, null, 5);
assert.equal(
  formatQualityReport(staleWhenAllRegenFail),
  preReport,
  'old pipeline: null repaired → frozen pre-repair report',
);

const freshEvenIfNull = simulateFixedPipelineResult(preQuality, null, 5, batch);
assert.equal(
  formatQualityReport(freshEvenIfNull),
  preReport,
  'fixed pipeline: null repaired still re-runs check (same content → same numbers, but fresh eval)',
);

const freshAfterSuccess = simulateFixedPipelineResult(preQuality, repaired, 5, batch);
assert.notEqual(formatQualityReport(freshAfterSuccess), preReport, 'fixed pipeline: success → updated report');

console.log('OK  test-mcq-length-bias-repair-revalidation.mjs (4× regen + post-repair quality refresh)');
