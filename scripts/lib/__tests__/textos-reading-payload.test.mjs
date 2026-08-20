#!/usr/bin/env node
/**
 * Textos reading payload — unit tests.
 * Run: node scripts/lib/__tests__/textos-reading-payload.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from '../loadEnv.mjs';

const require = createRequire(import.meta.url);
const {
  toTextosReadingPayload,
  extractTextosPassageBlock,
  wordCount,
} = require(path.join(ROOT, 'netlify/functions/lib/textosReadingPayload.js'));

const single = {
  id: 'lesen-t1-test',
  module: 'lesen',
  teil: 1,
  instruction: 'Lesen Sie den Text und beantworten Sie die Fragen.',
  passage: {
    title: 'Meine Stadt',
    text: 'Die Stadt ist grün und ruhig. Viele Menschen fahren mit dem Fahrrad zur Arbeit.',
  },
  questions: [
    {
      id: 'q1',
      question: 'Ist die Stadt laut?',
      correct: 'Falsch',
      options: ['Richtig', 'Falsch'],
      explanation: 'SECRET',
    },
  ],
};

const payload = toTextosReadingPayload(single);
assert.equal(payload.title, 'Meine Stadt');
assert.ok(payload.passageText.includes('Fahrrad'));
assert.ok(payload.wordCount >= 10);
assert.equal(payload.sourcePartId, 'lesen-t1-test');
assert.equal(payload.instruction, undefined, 'exam instruction must be stripped');
assert.equal(JSON.stringify(payload).includes('SECRET'), false);
assert.equal(JSON.stringify(payload).includes('correct'), false);
assert.equal(JSON.stringify(payload).includes('questions'), false);

const multi = {
  id: 'lesen-t4-test',
  module: 'lesen',
  teil: 4,
  passage: {
    title: 'Forum Diskussion',
    passages: [
      { textTitle: 'Kurz', text: 'Zu kurz.' },
      {
        textTitle: 'Langer Beitrag',
        text:
          'Dies ist ein längerer Forumsbeitrag über Umweltschutz in der Stadt und die Rolle '
          + 'der Bürgerinnen und Bürger beim Klimawandel. Viele Menschen engagieren sich für '
          + 'saubere Parks, weniger Autoverkehr und mehr Fahrradwege im Zentrum. Schulen '
          + 'pflanzen Bäume und Unternehmen sparen Energie. Die Stadtverwaltung fördert '
          + 'Solaranlagen auf Dächern und belohnt Mülltrennung mit niedrigeren Gebühren. '
          + 'Experten sagen, dass kleine Alltagsentscheidungen langfristig viel bewirken '
          + 'können, wenn viele mitmachen und Politik unterstützt.',
      },
    ],
  },
  questions: [{ id: 'q1', question: 'Worum geht es?', options: ['A', 'B'] }],
};

const multiBlock = extractTextosPassageBlock(multi);
assert.equal(multiBlock.passageText.includes('Umweltschutz'), true, 'T4 must pick longest block');
assert.equal(multiBlock.subtitle, 'Langer Beitrag');

const multiPayload = toTextosReadingPayload(multi);
assert.ok(!JSON.stringify(multiPayload).includes('Worum geht es'));

console.log('PASS: textos-reading-payload');
