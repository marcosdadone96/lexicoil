#!/usr/bin/env node
/**
 * Test manual publish paths apply balanceMcq before validation/promotion.
 *   node scripts/test-manual-publish-normalize-paths.mjs
 */
import assert from 'node:assert/strict';
import { validateLesenBatch } from './lib/pasteLesenBatchLib.mjs';
import {
  maybeNormalizeManualLesenBatch,
  measureMcqPositionDistribution,
  assertManualPublishPositionGates,
} from './lib/manualPublishNormalize.mjs';

function biasedBatch(teil = 5) {
  const mkQ = (id, correct) => ({
    id,
    module: 'lesen',
    teil,
    type: 'multiple_choice',
    question: `Frage ${id}?`,
    options: [
      'a) Richtige Antwort lang genug für den Test.',
      'b) Kurze falsche Antwort.',
      'c) Andere falsche Antwort.',
    ],
    correct,
    correctAnswer: correct,
    explanation: 'Im Text steht die korrekte Information ausdrücklich für diese Prüfregel.',
    passageId: 'p1',
    lang: 'de',
    level: 'B1',
  });
  return {
    topicTag: 'Konsum',
    passages: [
      {
        id: 'p1',
        module: 'lesen',
        teil,
        title: 'Test Hausordnung',
        text: 'Regel eins. Regel zwei. Regel drei. Regel vier.',
        lang: 'de',
        level: 'B1',
        topicTag: 'Konsum',
      },
    ],
    questions: [mkQ('q1', 'a'), mkQ('q2', 'a'), mkQ('q3', 'a'), mkQ('q4', 'a')],
  };
}

let passed = 0;

// 1) maybeNormalizeManualLesenBatch fixes 100%-a bias
{
  const raw = biasedBatch(5);
  const before = measureMcqPositionDistribution(raw);
  assert.equal(before.maxPct, 1, 'raw batch should be 100% a');
  const norm = maybeNormalizeManualLesenBatch(raw, { teil: 5, lang: 'de', level: 'B1' });
  const after = measureMcqPositionDistribution(norm);
  assert.ok(norm._balanceMcqVersion, 'stamp present');
  assert.ok(after.maxPct <= 0.55, `maxPct ${after.maxPct} should be <= 0.55`);
  console.log('OK  maybeNormalizeManualLesenBatch reduces position bias');
  passed++;
}

// 2) validateLesenBatch path normalizes before format check
{
  const raw = biasedBatch(5);
  const posBefore = measureMcqPositionDistribution(raw);
  assert.equal(posBefore.maxPct, 1);
  const check = validateLesenBatch(raw, {
    lang: 'de',
    level: 'B1',
    teil: 5,
    skipQuality: true,
    skipIngest: true,
    allowBankDup: true,
  });
  assert.ok(check.ok, `validate should pass format: ${check.errors?.join('; ')}`);
  console.log('OK  validateLesenBatch accepts batch after inline normalize');
  passed++;
}

// 3) promote-style position gate rejects unnormalized extreme bias
{
  const raw = biasedBatch(5);
  const pos = assertManualPublishPositionGates(raw, { teil: 5, lang: 'de', level: 'B1' });
  assert.ok(pos.ok, `normalized via gate should pass: ${pos.issues.join('; ')}`);
  assert.ok(pos.batch._balanceMcqVersion);
  console.log('OK  assertManualPublishPositionGates passes after normalize');
  passed++;
}

console.log(`\n${passed}/3 tests passed`);
