#!/usr/bin/env node
/**
 * Sprechen: teil assignment + T2/T3 quality gate alignment (CLI cell teil ≠ question teil).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assignMultiTeilQuestions, normalizeBatch } from '../normalizeBatch.mjs';
import { checkPromptBatchQuality } from '../promptBatchQuality.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const samplePath = path.join(ROOT, 'batches/ready/pool-verified/sprechen-gemini-009.json');
const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));

// Simulate Gemini omitting teil + pipeline injecting CLI cell teil=1 on all questions
const corrupted = {
  passages: [],
  questions: sample.questions.map((q) => {
    const { teil, ...rest } = q;
    return rest;
  }),
};

const normalized = normalizeBatch(corrupted, {
  module: 'sprechen',
  teil: 1,
  lang: 'de',
  level: 'B1',
  topicTag: 'Wohnen',
});

assert.deepEqual(
  normalized.questions.map((q) => q.teil),
  [1, 2, 3],
  'assigns teil 1–3 when CLI cell is sprechen-t1',
);

for (const t of [1, 2, 3]) {
  const q = checkPromptBatchQuality(normalized, 'sprechen', t);
  assert.equal(q.ok, true, `T${t} should pass after teil fix: ${q.issues.join('; ')}`);
}

// resolveExamQuestion falls back to index when teil fields are wrong (quality gate)
const allTeil1 = {
  passages: [],
  questions: sample.questions.map((q) => ({ ...q, teil: 1 })),
};
const t2ViaIndex = checkPromptBatchQuality(allTeil1, 'sprechen', 2);
assert.equal(t2ViaIndex.ok, true, 'T2 passes via question index fallback');

const reassigned = assignMultiTeilQuestions(allTeil1.questions, 'sprechen');
assert.deepEqual(
  reassigned.map((q) => q.teil),
  [1, 2, 3],
  'assignMultiTeilQuestions restores metadata for pool',
);

console.log('sprechen-teil-quality-alignment.test.mjs OK');
