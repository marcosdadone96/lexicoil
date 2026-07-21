#!/usr/bin/env node
/**
 * Acceptance: PDF grammar grouping + compact structure + UI localization (no browser).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

globalThis.S = { user: { name: 'Test User' }, subject: 'de', level: 'B1' };
globalThis.esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
globalThis.isPro = () => true;
globalThis.notify = () => {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => 'es' };

require(path.join(ROOT, 'js/i18n/consentLocale.js'));
require(path.join(ROOT, 'js/i18n/pdfReportLocale.js'));
require(path.join(ROOT, 'js/bootstrap/featurePdf.js'));

const correction = {
  parts: [
    {
      title: 'Lesen — Teil 1',
      items: [
        {
          ok: false,
          q: 'Frage 1',
          yours: 'A',
          correct: 'B',
          explanation: 'Passiv: das Verb steht am Ende.',
          grammarTags: ['g-de-b1-passiv'],
        },
        {
          ok: false,
          q: 'Frage 2',
          yours: 'Falsch',
          correct: 'Richtig',
          explanation: 'Relativsatz mit dem.',
          grammarTags: ['g-de-b1-passiv'],
        },
        { ok: true, q: 'Frage 3', yours: 'B', correct: 'B', grammarTags: ['g-de-b1-relativ'] },
      ],
    },
  ],
  writingAi: [
    {
      aufgabe: 1,
      correction: {
        correctedText: 'Liebe Anna, vielen Dank für deine Einladung.',
        summary: 'Gute Struktur, einige Fehler.',
        errors: [{ original: 'danke', correction: 'vielen Dank', explanation: 'Formellere Wendung' }],
      },
    },
  ],
};

const exam = { level: 'B1', lang: 'de', topic: 'Alltag', official: { certificate: 'Goethe B1' } };
const coaching = {
  topics: [
    {
      tag: 'g-de-b1-passiv',
      title: 'Passiv',
      explanation: 'Kurz erklärt.',
      examples: ['Das Haus wird gebaut.'],
      tip: 'Achte auf werden + Partizip II.',
    },
  ],
};

const htmlEs = globalThis.buildPdfHtml(62, { lesen: 55, schreiben: 72 }, exam, true, correction, null, coaching, 'es');
const htmlDe = globalThis.buildPdfHtml(62, { lesen: 55, schreiben: 72 }, exam, true, correction, null, coaching, 'de');
const htmlEnOne = globalThis.buildPdfHtml(
  62,
  { lesen: 55 },
  exam,
  true,
  {
    parts: [
      {
        title: 'Reading — Part 1',
        items: [{ ok: false, q: 'Q1', yours: 'A', correct: 'B', explanation: 'One error.', grammarTags: ['g-en-b1-tense'] }],
      },
    ],
  },
  null,
  null,
  'en',
);

function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

assert('ES grammar summary section', htmlEs.includes('Resumen de fallos por gramática'));
assert('ES writing corrected section', htmlEs.includes('Escritura — tu texto corregido'));
assert('ES AI coaching section', htmlEs.includes('Explicación gramatical (IA)'));
assert('ES module detail labels', htmlEs.includes('Tuyo:') && htmlEs.includes('Correcto:'));
assert('DE grammar summary section', htmlDe.includes('Fehler nach Grammatikthema'));
assert('DE module detail labels', htmlDe.includes('Deine Antwort:') && htmlDe.includes('Richtig:'));
assert('groups passiv tag', htmlEs.includes('Passiv'));
assert('no legacy page-break class', (htmlEs.match(/pdf-page-break/g) || []).length === 0);
assert('compact html length < 8000 chars', htmlEs.length < 8000);
assert('EN singular: 1 mistake', htmlEnOne.includes('1 mistake') && !htmlEnOne.includes('1 mistakes'));
assert('ES plural: 2 errores', htmlEs.includes('2 errores') && !htmlEs.includes('2 error</span>'));
assert('DE plural: 2 Fehler', htmlDe.includes('2 Fehler'));
assert('custom doc footer present', htmlEs.includes('LexiCoil · lexicoil.com'));

console.log(`\nPDF HTML length (ES): ${htmlEs.length} chars`);
console.log('\nPDF structure tests done.\n');
