#!/usr/bin/env node
/**
 * Validate Hören A2 T1 template exists and example JSON is syntactically valid.
 * No Gemini / generate-cli calls.
 *   node scripts/test-horen-a2-t1-template.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { examTemplatePath, loadExamTemplate } from './lib/examTemplatePrompt.mjs';
import { checkHorenBatchQuality } from './lib/horenBatchQuality.mjs';

const path = examTemplatePath('horen', 1, 'A2');
const text = loadExamTemplate('horen', 1, 'A2');

assert.ok(fs.existsSync(path), 'template file exists');
assert.match(text, /Hören A2 · Teil 1/i);
assert.match(text, /5 segmentos/i);
assert.match(text, /multiple_choice/i);
assert.match(text, /PROHIBIDO.*richtig_falsch/is);
assert.match(text, /level:"A2"/);
assert.match(text, /```json[\s\S]+```/);

const jsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
assert.ok(jsonBlocks.length >= 1, 'example JSON block present');
const sample = JSON.parse(jsonBlocks[jsonBlocks.length - 1][1]);

assert.equal(sample.passages.length, 2, 'example has 2 passages (structural demo)');
assert.equal(sample.questions.length, 2);
for (const q of sample.questions) {
  assert.equal(q.type, 'multiple_choice');
  assert.equal(q.level, 'A2');
  assert.equal(q.teil, 1);
  assert.ok(q.segmentLabel?.startsWith('Text '));
}

const fullFixture = {
  passages: Array.from({ length: 5 }, (_, i) => ({
    id: `gen-p-h1-fix-s${i + 1}`,
    module: 'horen',
    teil: 1,
    lang: 'de',
    level: 'A2',
    title: `Text ${i + 1}`,
    text: `Guten Tag! Dies ist ein kurzer Anruf Nummer ${i + 1}. Der Termin ist am Montag um zehn Uhr.`,
  })),
  questions: Array.from({ length: 5 }, (_, i) => ({
    id: `gen-q-h1-fix-q${i + 1}`,
    module: 'horen',
    teil: 1,
    lang: 'de',
    level: 'A2',
    type: 'multiple_choice',
    question: `Wann ist der Termin in Text ${i + 1}?`,
    options: ['a) Montag um 10 Uhr', 'b) Dienstag um 8 Uhr', 'c) Freitag um 14 Uhr'],
    correct: 'a',
    correctAnswer: 'a',
    explanation: `In Text ${i + 1} steht Montag um zehn Uhr als Termin.`,
    segmentLabel: `Text ${i + 1}`,
    passageId: `gen-p-h1-fix-s${i + 1}`,
  })),
};

const quality = checkHorenBatchQuality(fullFixture, 1, { level: 'A2' });
assert.ok(quality.ok || quality.issues.length === 0, `quality issues: ${quality.issues.join('; ')}`);

console.log('OK  test-horen-a2-t1-template.mjs');
console.log(`  template: ${path}`);
console.log(`  example JSON: valid`);
console.log(`  5×MCQ fixture: quality ${quality.ok ? 'OK' : quality.issues.length + ' issues'}`);
