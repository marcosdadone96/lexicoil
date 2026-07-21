/**
 * germanContentLanguageGate tests
 * Run: node scripts/lib/qualityGates/__tests__/germanContentLanguageGate.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessGermanExamText,
  runGermanContentLanguageGate,
} from '../germanContentLanguageGate.mjs';
import { ROOT } from '../../loadEnv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function testSpanishQuestionBlocked() {
  const bad = assessGermanExamText('La parada de autobús se traslada por un evento que se celebra el fin de semana.');
  assert.equal(bad.ok, false);
  const mcq = assessGermanExamText('¿Qué beneficios tiene usar la bicicleta o caminar?');
  assert.equal(mcq.ok, false);
}

function testGermanQuestionPasses() {
  const ok = assessGermanExamText('Wo hält der Bus der Linie 14 ab Freitagabend?');
  assert.equal(ok.ok, true);
  const rf = assessGermanExamText('Die Fahrschule bietet neue Termine auch am Wochenende an.');
  assert.equal(rf.ok, true);
}

function testSpanishExplanationBlocked() {
  const bad = assessGermanExamText(
    'El pasaje indica claramente que las reservaciones deben hacerse mindestens zwei Wochen im Voraus.',
    { minTokens: 6 },
  );
  assert.equal(bad.ok, false);
  const meta = assessGermanExamText(
    "La opción 'c' ha sido acortada para evitar el sesgo de longitud, manteniendo el sentido.",
    { minTokens: 6 },
  );
  assert.equal(meta.ok, false);
}

function testGateBlocksSpanishExplanation() {
  const batch = {
    lang: 'de',
    questions: [
      {
        id: 'q1',
        lang: 'de',
        type: 'multiple_choice',
        question: 'Wann muss man reservieren?',
        options: ['a) Zwei Wochen vorher.', 'b) Am selben Tag.', 'c) Gar nicht.'],
        explanation:
          'El pasaje indica claramente que las reservaciones deben hacerse mindestens zwei Wochen im Voraus.',
      },
    ],
  };
  const v = runGermanContentLanguageGate(batch, { file: 'test-spanish-explanation.json' });
  assert.equal(v.verdict, 'block');
  assert.ok(v.findings.some((f) => String(f.detail).includes('explanation')));
}

function testGateOnContaminatedBatch() {
  const file = path.join(ROOT, 'batches/needs-regeneration/horen-t1-gemini-029.json');
  const batch = JSON.parse(fs.readFileSync(file, 'utf8'));
  const v = runGermanContentLanguageGate(batch, { file: 'horen-t1-gemini-029.json' });
  assert.equal(v.verdict, 'block');
  assert.ok(v.findings.some((f) => f.rule === 'non_german_exam_text'));
}

function testGateOnCleanBatch() {
  const file = path.join(ROOT, 'batches/ready/pool-verified/horen-t1-gemini-031.json');
  const batch = JSON.parse(fs.readFileSync(file, 'utf8'));
  const v = runGermanContentLanguageGate(batch, { file: 'horen-t1-gemini-031.json' });
  assert.equal(v.verdict, 'pass');
}

let passed = 0;
const tests = [
  ['spanish question blocked', testSpanishQuestionBlocked],
  ['german question passes', testGermanQuestionPasses],
  ['spanish explanation blocked', testSpanishExplanationBlocked],
  ['gate blocks spanish explanation', testGateBlocksSpanishExplanation],
  ['contaminated batch blocked', testGateOnContaminatedBatch],
  ['clean batch passes', testGateOnCleanBatch],
];

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
