#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkHorenBatchIngest,
  checkHorenA2Register,
  A2_HOREN_B1_REGISTER_RE,
} from '../horenBatchIngestCheck.mjs';
import { normalizeBatch } from '../normalizeBatch.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Retired 045 — known B1 register failure
const badPath = path.join(ROOT, 'batches/needs-regeneration/A2/horen-t4-gemini-045.json');
assert.ok(fs.existsSync(badPath), 'horen-t4-gemini-045.json in needs-regeneration');
const bad045 = JSON.parse(fs.readFileSync(badPath, 'utf8'));
const badReport = checkHorenBatchIngest(bad045, { lang: 'de', level: 'A2', teil: 4, batchId: 'test-045' });
assert.equal(badReport.ok, false, '045 must fail ingest');
assert.ok(
  badReport.results.some((r) => r.errors.some((e) => /register_gate|cefr_gate/.test(e))),
  `045 errors: ${JSON.stringify(badReport.results[0]?.errors)}`,
);

// Simple A2 monologue segment — should pass register
const goodT1 = {
  passages: [
    {
      id: 'p1',
      text: 'Guten Tag! Das Schwimmbad ist heute bis 18 Uhr geöffnet. Ein Ticket kostet fünf Euro.',
    },
  ],
  questions: [{ module: 'horen', teil: 1, type: 'multiple_choice' }],
};
const regOk = checkHorenA2Register(goodT1, 1);
assert.equal(regOk.ok, true);

assert.ok(A2_HOREN_B1_REGISTER_RE.test('Das ist eine Herausforderung'));
assert.ok(!A2_HOREN_B1_REGISTER_RE.test('Das Schwimmbad ist geöffnet'));

// normalizeBatch A2 Hören: default difficulty 3, strip on pool path
const norm = normalizeBatch(
  {
    passages: [{ id: 'p', module: 'horen', teil: 1, text: 'Hallo.' }],
    questions: [{ id: 'q', module: 'horen', teil: 1, type: 'multiple_choice', correct: 'a' }],
  },
  { module: 'horen', teil: 1, lang: 'de', level: 'A2', stripPoolLegacy: true },
);
assert.equal(norm.questions[0].difficulty, undefined, 'A2 horen pool strip removes difficulty');

const normGen = normalizeBatch(
  {
    passages: [{ id: 'p', module: 'horen', teil: 1, text: 'Hallo.' }],
    questions: [{ id: 'q', module: 'horen', teil: 1, type: 'multiple_choice', correct: 'a' }],
  },
  { module: 'horen', teil: 1, lang: 'de', level: 'A2', stripPoolLegacy: false },
);
assert.equal(normGen.questions[0].difficulty, 3, 'A2 horen default difficulty is 3');

console.log('PASS: horen-a2-ingest-check');
