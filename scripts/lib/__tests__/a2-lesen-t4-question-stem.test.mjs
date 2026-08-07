/**
 * Lesen A2 T4 — stem aliases (question / text / questionText / statement).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLesenBatchQuality } from '../lesenBatchQuality.mjs';
import { lesenA2T4QuestionStem } from '../lesenA2T4Situations.mjs';
import {
  QUESTION_STEM_FIELD_ALIASES,
  resolveQuestionStem,
} from '../questionStemAliases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const REJECTED_TEXT = path.join(
  ROOT,
  'batches/generated/.rejected/lesen-t4-gemini-098-2026-07-29T10-57-34-559Z.json',
);
const REJECTED_QUESTION_TEXT = path.join(
  ROOT,
  'batches/generated/.rejected/lesen-t4-gemini-098-2026-07-29T12-12-53-779Z.json',
);

function loadBatch(file) {
  assert.ok(fs.existsSync(file), `missing fixture ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Alias module: canonical order matches corpus audit
{
  assert.deepEqual(QUESTION_STEM_FIELD_ALIASES, [
    'question',
    'text',
    'questionText',
    'statement',
  ]);
  assert.equal(resolveQuestionStem({ question: ' A ' }), 'A');
  assert.equal(resolveQuestionStem({ text: 'B' }), 'B');
  assert.equal(resolveQuestionStem({ questionText: 'C' }), 'C');
  assert.equal(resolveQuestionStem({ statement: 'D' }), 'D');
  assert.equal(resolveQuestionStem({ signText: 'opinion' }), '');
}

// Intento #1: enunciados solo en `text` → gate debe pasar mini-situación
{
  const batch = loadBatch(REJECTED_TEXT);
  assert.equal(batch.questions.every((q) => !String(q.question || '').trim()), true);
  assert.ok(batch.questions.every((q) => lesenA2T4QuestionStem(q).length > 40));

  const quality = checkLesenBatchQuality(batch, 4, { level: 'A2', skipG2Log: true });
  assert.equal(
    quality.ok,
    true,
    `intent #1 should pass: ${quality.issues.join('; ')}`,
  );
  assert.equal(
    quality.issues.some((i) => i.includes('mini-situación')),
    false,
  );
}

// Intento questionText-only (12-12-53): mini-situación válida, no 6× genérico
{
  const batch = loadBatch(REJECTED_QUESTION_TEXT);
  assert.equal(batch.questions.every((q) => !String(q.question || '').trim()), true);
  assert.equal(
    batch.questions.every((q) => String(q.questionText || '').trim().length > 40),
    true,
  );
  assert.ok(batch.questions.every((q) => lesenA2T4QuestionStem(q).length > 40));

  const quality = checkLesenBatchQuality(batch, 4, { level: 'A2', skipG2Log: true });
  assert.equal(
    quality.ok,
    true,
    `questionText batch should pass mini-situación: ${quality.issues.join('; ')}`,
  );
  assert.equal(
    quality.issues.some((i) => i.includes('mini-situación')),
    false,
  );
}

// Adversarial: genérico en `text`, `question` vacío → debe fallar
{
  const batch = loadBatch(REJECTED_TEXT);
  batch.questions = batch.questions.map((q) => ({
    ...q,
    question: '',
    text: 'Welche Anzeige passt?',
    questionText: '',
  }));
  const quality = checkLesenBatchQuality(batch, 4, { level: 'A2', skipG2Log: true });
  assert.equal(quality.ok, false);
  assert.ok(
    quality.issues.some((i) => i.includes('mini-situación')),
    `expected mini-situación fail, got: ${quality.issues.join('; ')}`,
  );
}

// Normalización: text / questionText → question en pipeline
{
  const { normalizeBatch } = await import('../normalizeBatch.mjs');
  const textBatch = loadBatch(REJECTED_TEXT);
  const normText = normalizeBatch(
    { questions: textBatch.questions.slice(0, 1) },
    { module: 'lesen', teil: 4, lang: 'de', level: 'A2' },
  );
  assert.equal(normText.questions[0].question, textBatch.questions[0].text);

  const qtBatch = loadBatch(REJECTED_QUESTION_TEXT);
  const normQt = normalizeBatch(
    { questions: qtBatch.questions.slice(0, 1) },
    { module: 'lesen', teil: 4, lang: 'de', level: 'A2' },
  );
  assert.equal(normQt.questions[0].question, qtBatch.questions[0].questionText);
}

console.log('a2-lesen-t4-question-stem.test.mjs: OK');
