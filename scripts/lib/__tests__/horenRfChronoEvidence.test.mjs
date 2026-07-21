/**
 * CANONICAL Hören T3 R/F chrono = char offset in passages[0].text.
 * Audio-turn token overlap is explicitly forbidden as a chrono metric.
 *
 *   node --test scripts/lib/__tests__/horenRfChronoEvidence.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOREN_RF_CHRONO_EVIDENCE_VERSION,
  HOREN_RF_CHRONO_FORBIDDEN_METRIC,
  evidenceCharPos,
  evidenceCharVector,
  isCharEvidenceMonotonic,
  reorderRfByCharEvidence,
  verifyRfChronoByCharPos,
} from '../horenRfChronoEvidence.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CANARY = path.join(
  ROOT,
  'batches/ready/horen-t3-staging-2026-07-11-canary',
);

test('docs: version + forbidden audio-turn metric are explicit', () => {
  assert.match(HOREN_RF_CHRONO_EVIDENCE_VERSION, /char-pos/);
  assert.match(HOREN_RF_CHRONO_FORBIDDEN_METRIC, /audio-turn/);
  assert.match(HOREN_RF_CHRONO_FORBIDDEN_METRIC, /NOT chronological/i);
});

test('isCharEvidenceMonotonic: only char positions, not turn indices', () => {
  assert.equal(isCharEvidenceMonotonic([10, 20, 30]), true);
  assert.equal(isCharEvidenceMonotonic([10, 5, 30]), false);
  // A turn-like mono vector must NOT be accepted as a substitute check —
  // callers must pass char offsets from evidenceCharVector / verifyRfChronoByCharPos.
  assert.equal(isCharEvidenceMonotonic([0, 1, 2, 3, 4, 5, 10]), true); // numerically mono
  // but that is only valid IF those numbers came from char offsets, not turns.
  assert.match(HOREN_RF_CHRONO_FORBIDDEN_METRIC, /false-green/);
});

test('reorderRfByCharEvidence: shuffled R/F becomes mono by char pos (changed=true)', () => {
  const text =
    'Start. AlphaUniqueNeedle appears first here. ' +
    'Then BetaUniqueNeedle sits in the middle section. ' +
    'Finally GammaUniqueNeedle closes the passage end.';
  const batch = {
    passages: [{ text, audio: [{ text: 'turn metric must be ignored' }] }],
    questions: [
      {
        id: 'gen-q-3',
        type: 'richtig_falsch',
        question: 'About gamma?',
        explanation: 'Speaker mentions "GammaUniqueNeedle closes".',
        vocabularyTags: ['GammaUniqueNeedle'],
      },
      {
        id: 'gen-q-1',
        type: 'richtig_falsch',
        question: 'About alpha?',
        explanation: 'Speaker mentions "AlphaUniqueNeedle appears".',
        vocabularyTags: ['AlphaUniqueNeedle'],
      },
      {
        id: 'gen-q-2',
        type: 'richtig_falsch',
        question: 'About beta?',
        explanation: 'Speaker mentions "BetaUniqueNeedle sits".',
        vocabularyTags: ['BetaUniqueNeedle'],
      },
    ],
  };
  const before = evidenceCharVector(batch);
  assert.equal(before[0], text.indexOf('GammaUniqueNeedle'));
  assert.equal(before[1], text.indexOf('AlphaUniqueNeedle'));
  assert.equal(before[2], text.indexOf('BetaUniqueNeedle'));
  assert.equal(isCharEvidenceMonotonic(before), false, 'precondition: shuffled');
  const r = reorderRfByCharEvidence(batch);
  assert.equal(r.changed, true);
  assert.equal(r.mode, 'char-evidence');
  assert.deepEqual(
    batch.questions.map((q) => q.id),
    ['gen-q-1', 'gen-q-2', 'gen-q-3'],
  );
  const after = evidenceCharVector(batch);
  assert.equal(isCharEvidenceMonotonic(after), true);
  assert.deepEqual(r.beforePos, before);
  assert.deepEqual(r.afterPos, after);
  assert.equal(r.mode.includes('turn'), false);
});

test('canary 001/002/004: char-pos vectors are monotonic (canonical metric)', () => {
  for (const name of [
    'horen-t3-gemini-001.json',
    'horen-t3-gemini-002.json',
    'horen-t3-gemini-004.json',
  ]) {
    const batch = JSON.parse(fs.readFileSync(path.join(CANARY, name), 'utf8'));
    const v = verifyRfChronoByCharPos(batch);
    assert.equal(v.metric, 'char-pos-passages[0].text');
    assert.equal(
      v.ok,
      true,
      `${name} char vector not mono: ${JSON.stringify(v.positions)}`,
    );
    // Sanity: every question resolved to a real offset
    assert.ok(v.positions.every((p) => p >= 0), `${name} unresolved pos`);
  }
});

test('evidenceCharPos prefers quote over audio (quote in explanation)', () => {
  const text = 'Prefix. Unique quoted span xyzzy. Suffix other words.';
  const q = {
    question: 'Something about other words?',
    explanation: 'Speaker says "Unique quoted span xyzzy" clearly.',
    vocabularyTags: ['other'],
  };
  const e = evidenceCharPos(q, text);
  assert.equal(e.via.startsWith('quote'), true);
  assert.equal(e.pos, text.indexOf('Unique quoted span xyzzy'));
});
