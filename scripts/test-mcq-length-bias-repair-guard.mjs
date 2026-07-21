#!/usr/bin/env node
/**
 * Unit tests: MCQ length-bias repair anti-worsening guard + T5 vocab×subtipo.
 */
import assert from 'node:assert/strict';
import {
  lengthBiasScore,
  lengthBiasPatchImproved,
  failsLengthBiasGate,
  repairMcqLengthBiasBatch,
} from './lib/mcqLengthBiasRepair.mjs';
import { adaptT5WordsForSubtype, checkT5VocabIntegration } from './lib/lesenT5SubtypeVocab.mjs';
import { buildMcqLengthBiasBatchRepairPrompt } from './lib/lesenTemplatePrompt.mjs';

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

const biasedQ = mcq('gen-q-5-test-1', 'b', [
  'Kurze falsche Antwort hier',
  'Diese korrekte Antwort ist absichtlich viel länger als alle anderen Optionen im Test',
  'Auch kurz',
]);

assert.ok(lengthBiasScore(biasedQ) > 20, 'biased question has high score');
assert.ok(failsLengthBiasGate(biasedQ), 'biased question fails gate');

const worseningPatch = {
  options: [
    'a) Noch kürzer',
    'b) Diese korrekte Antwort es nun noch viel länger als zuvor und übertrifft alle anderen deutlich',
    'c) Kurz',
  ],
};
const worseningMerged = { ...biasedQ, options: worseningPatch.options };
assert.ok(
  !lengthBiasPatchImproved(biasedQ, worseningMerged),
  'worsening patch not improved',
);
assert.ok(
  lengthBiasScore(worseningMerged) > lengthBiasScore(biasedQ),
  'worsening patch increases score',
);

const improvingPatch = {
  options: [
    'a) Besucher müssen im gesamten Freizeitzentrum immer sehr lange Textilien tragen',
    'b) Im Hallenbad gilt die Regel nur werktags',
    'c) Im Foyer darf man jederzeit laut telefonieren und essen',
  ],
};
const improvingMerged = { ...biasedQ, options: improvingPatch.options };
assert.ok(lengthBiasPatchImproved(biasedQ, improvingMerged), 'improving patch detected');

const prompt = buildMcqLengthBiasBatchRepairPrompt({
  items: [
    {
      question: biasedQ,
      sourceText: 'Im Freizeitzentrum gelten feste Regeln für alle Besucher.',
      letter: 'b',
      correctBody: mcqOptionBodyFrom(biasedQ, 'b'),
    },
  ],
  teil: 5,
  module: 'lesen',
  level: 'B1',
});
assert.match(prompt, /META:/, 'repair prompt includes numeric META');
assert.match(prompt, /chars/, 'repair prompt includes char counts');

function mcqOptionBodyFrom(q, letter) {
  const idx = { a: 0, b: 1, c: 2 }[letter];
  return q.options[idx].replace(/^[a-c]\)\s*/i, '');
}

let regenCalled = false;
let batchPatchApplied = false;
const batch = {
  passages: [{ id: 'gen-l5-test', text: 'Regeln im Freizeitzentrum für Besucher und Kurse.' }],
  questions: [biasedQ],
};

const mockLlm = async ({ prompt }) => {
  if (prompt.includes('Reescribe COMPLETA')) {
    regenCalled = true;
    return {
      text: JSON.stringify({
        id: biasedQ.id,
        question: biasedQ.question,
        options: improvingPatch.options,
        correct: 'b',
        correctAnswer: 'b',
        explanation: biasedQ.explanation,
      }),
    };
  }
  batchPatchApplied = true;
  return {
    text: JSON.stringify({
      questions: [{ id: biasedQ.id, options: worseningPatch.options, explanation: biasedQ.explanation }],
    }),
  };
};

const repaired = await repairMcqLengthBiasBatch(
  batch,
  5,
  [`${biasedQ.id}: sesgo de longitud MCQ (B1) — opción correcta «b» es la más larga`],
  mockLlm,
  { module: 'lesen', level: 'B1' },
);

assert.ok(batchPatchApplied, 'batch repair LLM was invoked');
assert.ok(regenCalled, 'regen fallback invoked after rejected worsening patch');
assert.ok(repaired?.questions?.[0], 'repair returned batch');
assert.ok(
  lengthBiasPatchImproved(biasedQ, repaired.questions[0]),
  'final question improved vs original',
);
assert.ok(
  lengthBiasScore(repaired.questions[0]) < lengthBiasScore(biasedQ),
  'final score lower than original',
);

const konsumWords = ['marke', 'supermarkt', 'aufgabe', 'situation', 'aktuell', 'betreffen'];
const adapted = adaptT5WordsForSubtype(konsumWords, 'Konsum', 'freizeitzentrum');
assert.ok(adapted.swapped.length >= 2, 'freizeitzentrum swaps retail words');
assert.ok(!adapted.words.includes('supermarkt'), 'supermarkt removed for freizeitzentrum');
assert.ok(adapted.words.some((w) => /anmeldung|gebühr|schwimmbad|kurs/i.test(w)), 'subtype words injected');

const vocabFail = checkT5VocabIntegration({
  userVocabFeedback: {
    requested: konsumWords,
    used: [],
    notUsed: konsumWords,
  },
});
assert.equal(vocabFail.ok, false, '0/6 fails T5 vocab gate');

const vocabOk = checkT5VocabIntegration({
  userVocabFeedback: {
    requested: konsumWords,
    used: ['anmeldung', 'gebühr'],
    notUsed: konsumWords.slice(2),
  },
});
assert.equal(vocabOk.ok, true, '2/6 passes T5 vocab gate');

console.log('OK  test-mcq-length-bias-repair-guard.mjs (guard + regen + vocab×subtipo)');
