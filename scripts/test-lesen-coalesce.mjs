#!/usr/bin/env node
/** Haiku often returns R/F statements in items[] — normalize must promote to questions[]. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

globalThis.S = { subject: 'de', level: 'B1', history: [] };
globalThis.window = globalThis;
globalThis.lcDebug = { log() {}, warn() {} };

const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examGeneration.js'), 'utf8');
vm.runInThisContext(src, { filename: 'examGeneration.js' });

const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const raw = {
  level: 'B1',
  lang: 'de',
  lesenParts: [
    {
      teil: 1,
      text: 'Ein langer Text ueber Umwelt und Natur in der Stadt mit vielen Details und Beispielen.',
      items: Array.from({ length: 6 }, (_, i) => ({
        id: `l${i + 1}`,
        question: `Aussage ${i + 1}?`,
        correct: i % 2 ? 'F' : 'R',
        type: 'multiple',
      })),
    },
  ],
};

const norm = normalizeExam(raw);
assert(norm.lesenParts[0].questions?.length === 6, 'items promoted to questions[]');
assert(!norm.lesenParts[0].items?.length, 'items cleared after promotion');
assert(norm.lesenParts[0].questions[0].type === 'rf', 'type coerced to rf');

const check = new ExamValidator().validate(
  { ...norm, vocabPersonal: true },
  { strict: false, blueprint: false },
);
assert(check.valid, 'personal lesen-only exam validates after normalize');

// ── Teil 3 is ads-matching in Goethe, not in Cambridge ────────────────────────
// coalesceLesenAdsMatchingPart used to treat `teil === 3` as proof of an ads-matching
// task. For Cambridge Reading Part 3 (long_text MCQ) that copied the questions into
// items, retyped them as matching and deleted their options, while the originals stayed
// in questions[] — so the part rendered twice, once as stemless A-D/0 radios. Loading the
// fallback module is what makes normalizeExam reach that code path, exactly as the browser
// does through sanitizeGoetheParts.
globalThis.PersonalLesenPoolFallback = require(
  path.join(ROOT, 'js/engine/personalLesenPoolFallback.js'),
);
assert(
  typeof globalThis.PersonalLesenPoolFallback.coalesceLesenAdsMatchingPart === 'function',
  'pool fallback helper is reachable from normalizeExam',
);

const cambridgeP3 = normalizeExam({
  level: 'B1',
  lang: 'en',
  lesenParts: [
    {
      teil: 3,
      blueprintSlot: 'long_text',
      instruction: 'Read the text and answer the questions.',
      text: 'A long article about moving to a new city, with enough words to read.',
      questions: Array.from({ length: 5 }, (_, i) => ({
        id: `q${i + 1}`,
        type: 'multiple_choice',
        question: `What does the writer say about point ${i + 1}?`,
        options: ['A) first', 'B) second', 'C) third', 'D) fourth'],
        correct: 'A',
      })),
    },
  ],
}).lesenParts[0];

assert(cambridgeP3.questions?.length === 5, 'Cambridge P3 keeps its 5 questions');
assert(!cambridgeP3.items?.length, 'Cambridge P3 grows no matching items');
assert(!cambridgeP3.ads?.length, 'Cambridge P3 grows no ad pool');
assert(
  cambridgeP3.questions.every((q) => (q.options || []).length === 4),
  'Cambridge P3 questions keep their four options',
);
assert(
  cambridgeP3.questions.every((q) => String(q.type).toLowerCase() !== 'matching'),
  'Cambridge P3 questions stay multiple choice',
);

// The German side of the same guard: no slot declared, so Teil 3 still coalesces.
const goetheT3 = normalizeExam({
  level: 'B1',
  lang: 'de',
  lesenParts: [
    {
      teil: 3,
      ads: [
        { key: 'A', title: 'Sprachschule', text: 'Deutschkurse fuer Anfaenger am Abend.' },
        { key: 'B', title: 'Fahrschule', text: 'Fuehrerschein in vier Wochen, guenstig.' },
        { key: 'C', title: 'Fitnessstudio', text: 'Trainieren Sie taeglich bis 22 Uhr.' },
      ],
      questions: Array.from({ length: 3 }, (_, i) => ({
        id: `s${i + 1}`,
        type: 'matching',
        question: `Situation ${i + 1}: Jemand sucht etwas Passendes.`,
        correct: ['A', 'B', 'C'][i],
      })),
    },
  ],
}).lesenParts[0];

assert(goetheT3.items?.length === 3, 'Goethe T3 still coalesces its situations into items');
assert(goetheT3.ads?.length === 3, 'Goethe T3 keeps its ad pool');
assert(
  goetheT3.items.every((it) => String(it.type).toLowerCase() === 'matching'),
  'Goethe T3 items stay matching',
);

console.log('\nAll lesen-coalesce tests passed.');
