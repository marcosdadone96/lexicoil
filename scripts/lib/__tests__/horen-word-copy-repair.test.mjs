#!/usr/bin/env node
/**
 * Hören T1 MCQ: reparación debe parchear opción correcta (no solo enunciado).
 * Caso real: «genügend pausen während der» en opción correcta.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const {
  buildForbiddenNgramList,
  parseWordMatchFindings,
  repairWordMatchBatch,
} = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/wordMatchRepair.mjs')).href);
const { hasLongLiteralOverlap } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/lesenBatchQuality.mjs')).href,
);
const { buildT2McqWordCopyBatchRepairPrompt } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/lesenTemplatePrompt.mjs')).href,
);

function pass(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

const transcript =
  'Guten Tag. In unserem Kurs legen wir Wert auf genügend Pausen während der Übungen. ' +
  'Die Anmeldung läuft noch bis Freitag.';

const issue =
  'gen-q-h1-test-s3-q2: opción correcta copia ≥4 palabras del audio («genügend pausen während der»)';
const findings = parseWordMatchFindings([issue]);
pass('parses horen mcq finding', findings.length === 1);

const ngrams = buildForbiddenNgramList(transcript, ['genügend pausen während der']);
pass('ngrams include offending phrase', ngrams.some((g) => g.includes('genügend pausen')));

const prompt = buildT2McqWordCopyBatchRepairPrompt({
  passages: [{ id: 'gen-p-h1-test-s3', text: transcript }],
  items: [
    {
      question: {
        id: 'gen-q-h1-test-s3-q2',
        passageId: 'gen-p-h1-test-s3',
        type: 'multiple_choice',
        question: 'Was ist im Kurs wichtig?',
        correct: 'b',
        correctAnswer: 'b',
        options: [
          'a) Schnelles Tempo',
          'b) Man soll genügend Pausen während der Übung einplanen',
          'c) Keine Pausen',
        ],
        explanation: 'Im Audio wird betont dass genügend Pausen während der Übungen wichtig sind für alle.',
      },
      passage: { id: 'gen-p-h1-test-s3', text: transcript },
      findings,
    },
  ],
  minWords: 4,
  forbiddenNgrams: ngrams,
  examLabel: 'Goethe B1 Hören Teil 1',
});
pass('prompt lists forbidden ngrams', prompt.includes('genügend pausen'));

const batch = {
  passages: [{ id: 'gen-p-h1-test-s3', text: transcript }],
  questions: [
    {
      id: 'gen-q-h1-test-s3-q2',
      passageId: 'gen-p-h1-test-s3',
      type: 'multiple_choice',
      module: 'horen',
      question: 'Was ist im Kurs wichtig?',
      correct: 'b',
      correctAnswer: 'b',
      options: [
        'a) Schnelles Tempo',
        'b) Man soll genügend Pausen während der Übung einplanen',
        'c) Keine Pausen',
      ],
      explanation: 'Im Audio wird betont dass genügend Pausen während der Übungen wichtig sind für alle.',
    },
  ],
};

let calls = 0;
const repaired = await repairWordMatchBatch(
  batch,
  1,
  [issue],
  async () => {
    calls += 1;
    return {
      text: JSON.stringify({
        questions: [
          {
            id: 'gen-q-h1-test-s3-q2',
            question: 'Was ist im Kurs wichtig?',
            correct: 'b',
            correctAnswer: 'b',
            options: [
              'a) Schnelles Tempo',
              'b) Regelmäßige Erholungsphasen in den Einheiten',
              'c) Keine Pausen',
            ],
            explanation: 'Die Sprecherin erklärt dass Erholungsphasen zwischen den Übungen vorgesehen sind.',
          },
        ],
      }),
    };
  },
  { module: 'horen', teil: 1 },
);

pass('one LLM call for mcq horen repair', calls === 1);
assert.ok(repaired, 'expected repair');
const optB = repaired.questions[0].options[1].replace(/^[a-d]\)\s*/i, '');
pass(
  'repaired option no longer copies transcript',
  !hasLongLiteralOverlap(optB, transcript, 4),
);

console.log('PASS: horen T1 MCQ word-copy repair');
