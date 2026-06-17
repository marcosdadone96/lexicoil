#!/usr/bin/env node
/**
 * Acceptance: PDF grammar grouping + compact structure (no browser).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal browser globals for featurePdf.js
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

const html = globalThis.buildPdfHtml(
  62,
  { lesen: 55, schreiben: 72 },
  { level: 'B1', lang: 'de', topic: 'Alltag', official: { certificate: 'Goethe B1' } },
  true,
  correction,
  null,
  { topics: [{ tag: 'g-de-b1-passiv', title: 'Passiv', explanation: 'Kurz erklärt.', examples: ['Das Haus wird gebaut.'], tip: 'Achte auf werden + Partizip II.' }] },
);

const pageBreaks = (html.match(/pdf-page-break/g) || []).length;
const hasGrammar = html.includes('Resumen de fallos por gramática');
const hasWriting = html.includes('Schreiben — tu texto corregido');
const hasCoaching = html.includes('Explicación gramatical');
const hasPassiv = html.includes('Passiv');

function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

assert('no legacy page-break class', pageBreaks === 0);
assert('grammar summary section', hasGrammar);
assert('writing corrected section', hasWriting);
assert('AI coaching section', hasCoaching);
assert('groups passiv tag', hasPassiv);
assert('compact html length < 8000 chars', html.length < 8000);

console.log(`\nPDF HTML length: ${html.length} chars`);
console.log('\nPDF structure tests done.\n');
