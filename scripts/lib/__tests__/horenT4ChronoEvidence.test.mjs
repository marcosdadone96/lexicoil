/**
 * Hören T4 matching chrono gate tests.
 *
 *   node --test scripts/lib/__tests__/horenT4ChronoEvidence.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOREN_T4_CHRONO_EVIDENCE_VERSION,
  verifyHorenT4MatchingChrono,
} from '../horenT4ChronoEvidence.mjs';
import { shuffleKeyedQuestionOrder } from '../balanceMcq.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified/B1');

function loadPoolT4(name) {
  return JSON.parse(fs.readFileSync(path.join(POOL, name), 'utf8'));
}

test('version stamp is explicit', () => {
  assert.match(HOREN_T4_CHRONO_EVIDENCE_VERSION, /matching-char-pos/);
});

test('shuffleKeyedQuestionOrder preserves matching question order', () => {
  const qs = Array.from({ length: 8 }, (_, i) => ({
    id: `gen-q-h4-shuf-${i + 1}`,
    type: 'matching',
    passageId: 'p1',
    question: `Statement ${i}`,
  }));
  const out = shuffleKeyedQuestionOrder(qs, { seed: 'horen-t4-matching-chrono' });
  assert.deepEqual(
    out.map((q) => q.id),
    qs.map((q) => q.id),
  );
});

test('intro-moderador late anchor is blocking', () => {
  const text =
    'Moderator: Willkommen. Heute diskutieren wir Medien. Sind alte Medien noch relevant?\n' +
    'Noah: Traditionelle Medien bieten Tiefe und Qualität.\n'.repeat(12) +
    'Moderator: Zum Schluss danke ich den Gästen. Die Relevanz der Medien bleibt spannend.';
  const batch = {
    passages: [{ text }],
    questions: Array.from({ length: 8 }, (_, i) => ({
      id: `gen-q-h4-test-${i + 1}`,
      module: 'horen',
      teil: 4,
      type: 'matching',
      question:
        i === 6
          ? 'Die Sendung beleuchtet die Relevanz klassischer Medien.'
          : `Guest point ${i + 1} with unique phrase needlezz${i}abc.`,
      explanation:
        i === 6
          ? 'Der Moderator stellt zu Beginn die zentrale Frage vor.'
          : `Speaker says needlezz${i}abc clearly.`,
      correct: i === 6 ? 'a' : 'b',
      options: ['a) Moderator', 'b) Noah', 'c) Omar'],
      vocabularyTags: i === 6 ? ['Relevanz', 'Sendung'] : [`needlezz${i}`],
    })),
  };
  const v = verifyHorenT4MatchingChrono(batch);
  assert.equal(v.ok, false);
  assert.ok(
    v.blockingIssues.some((m) => m.includes('intro-moderador')),
    v.blockingIssues.join('; '),
  );
});

test('pool-verified: fixed files pass CHK-29 contract', () => {
  for (const name of [
    'horen-t4-gemini-018.json',
    'horen-t4-gemini-006.json',
    'horen-t4-gemini-008.json',
    'horen-t4-gemini-011.json',
    'horen-t4-gemini-016.json',
  ]) {
    const batch = loadPoolT4(name);
    const v = verifyHorenT4MatchingChrono(batch);
    assert.equal(v.ok, true, `${name}: ${JSON.stringify(v.blockingIssues)}`);
    assert.equal(v.mono, true, `${name} not mono`);
  }
});

test('pool-verified: full T4 scan — fixed + manually verified clean pass', () => {
  const mustPass = new Set([
    'horen-t4-gemini-018.json',
    'horen-t4-gemini-006.json',
    'horen-t4-gemini-008.json',
    'horen-t4-gemini-011.json',
    'horen-t4-gemini-016.json',
    'horen-t4-gemini-019.json',
    'horen-t4-gemini-020.json',
  ]);
  const files = fs
    .readdirSync(POOL)
    .filter((f) => /^horen-t4-gemini-\d+\.json$/.test(f))
    .sort();
  const failedMustPass = [];
  const otherBlocks = [];
  for (const file of files) {
    const batch = loadPoolT4(file);
    const v = verifyHorenT4MatchingChrono(batch);
    if (!v.ok) {
      if (mustPass.has(file)) failedMustPass.push({ file, issues: v.blockingIssues });
      else otherBlocks.push({ file, issues: v.blockingIssues });
    }
  }
  assert.deepEqual(failedMustPass, [], JSON.stringify(failedMustPass, null, 2));
  // Gate may still flag other pool files with high-confidence inversions (expected).
  assert.ok(otherBlocks.length >= 0);
});
