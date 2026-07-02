/**
 * chk23PublishGate.test.mjs — V-01 regression: CHK-23 blocks publication
 *
 * An assembled exam where a Hören part has conflicting `correct` values for
 * the same question ID in `questions[]` vs `segments[].questions[]` must be
 * blocked by isExamPublishable() BEFORE flattenExam resolves the conflict
 * silently.
 *
 * Run: node scripts/lib/__tests__/chk23PublishGate.test.mjs
 * Exit 0 = all pass. No LLM calls. No file I/O.
 */

import { isExamPublishable, chk23 } from '../../audit-pass-2.mjs';

let passed = 0;
let failed = 0;

function assert(desc, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Shared passage / transcript ───────────────────────────────────────────────

const TRANSCRIPT = 'Moderator: Was essen Sie gern? Gast: Ich esse gern Pasta und manchmal auch Fisch. Moderator: Danke.';

// ── Conflicting Hören T2 part ─────────────────────────────────────────────────
// Same question IDs appear in BOTH part.questions[] and part.segments[0].questions[]
// but with DIFFERENT correct values.

const CONFLICT_PART = {
  id: 'test-horen-t2-conflict',
  module: 'horen',
  teil: 2,
  transcript: TRANSCRIPT,
  // segments[].questions: correct="a" (matches transcript → real answer)
  segments: [{
    transcript: TRANSCRIPT,
    questions: [
      { id: 'q1', module: 'horen', teil: 2, type: 'multiple_choice', question: 'Was isst der Gast gern?', correct: 'a', options: ['a) Pasta', 'b) Brot', 'c) Salat'], explanation: 'Gast: Pasta' },
      { id: 'q2', module: 'horen', teil: 2, type: 'multiple_choice', question: 'Was isst der Gast manchmal?', correct: 'b', options: ['a) Pasta', 'b) Fisch', 'c) Fleisch'], explanation: 'Gast: manchmal auch Fisch' },
      { id: 'q3', module: 'horen', teil: 2, type: 'multiple_choice', question: 'Wer stellt die Frage?', correct: 'c', options: ['a) Gast', 'b) Zuschauer', 'c) Moderator'], explanation: 'Moderator stellt die Frage' },
    ],
  }],
  // questions[]: DIFFERENT correct values (bug: migration artifact)
  questions: [
    { id: 'q1', module: 'horen', teil: 2, type: 'multiple_choice', question: 'Was isst der Gast gern?', correct: 'c', options: ['a) Pasta', 'b) Brot', 'c) Salat'], explanation: 'wrong' },
    { id: 'q2', module: 'horen', teil: 2, type: 'multiple_choice', question: 'Was isst der Gast manchmal?', correct: 'a', options: ['a) Pasta', 'b) Fisch', 'c) Fleisch'], explanation: 'wrong' },
    { id: 'q3', module: 'horen', teil: 2, type: 'multiple_choice', question: 'Wer stellt die Frage?', correct: 'a', options: ['a) Gast', 'b) Zuschauer', 'c) Moderator'], explanation: 'wrong' },
  ],
};

// ── Block 1: chk23 standalone detects the conflict ───────────────────────────
console.log('\n── Block 1: chk23 detects conflict in the raw part ──');

const chk23Findings = chk23(CONFLICT_PART, 'test-part');

assert(
  'chk23 emits at least 1 finding for the conflicting part',
  chk23Findings.length > 0,
  true,
);
assert(
  'chk23 finding is CRITICAL',
  chk23Findings[0]?.severity,
  'CRITICAL',
);
assert(
  'chk23 finding id is CHK-23',
  chk23Findings[0]?.id,
  'CHK-23',
);

// ── Block 2: isExamPublishable blocks the conflicting exam ───────────────────
console.log('\n── Block 2: isExamPublishable blocks exam with CHK-23 conflict ──');

const conflictExam = {
  exam: {
    lesenParts: [],
    horenParts: [CONFLICT_PART],
    schreibenParts: [],
  },
};

const result = isExamPublishable(conflictExam);

assert(
  'isExamPublishable returns ok=false for conflicting exam',
  result.ok,
  false,
);
assert(
  'blocking array contains CHK-23',
  result.blocking.some(f => f.id === 'CHK-23'),
  true,
);

// ── Block 3: a clean part (no conflict) is NOT blocked by CHK-23 ─────────────
console.log('\n── Block 3: clean part (no conflicting IDs) passes CHK-23 ──');

const CLEAN_PART = {
  id: 'test-horen-t2-clean',
  module: 'horen',
  teil: 2,
  transcript: TRANSCRIPT,
  // Only segments, no top-level questions[] — the normal post-Eje2 shape
  segments: [{
    transcript: TRANSCRIPT,
    questions: [
      { id: 'q4', module: 'horen', teil: 2, type: 'multiple_choice', question: 'Was isst der Gast gern?', correct: 'a', options: ['a) Pasta', 'b) Brot', 'c) Salat'], explanation: 'Gast: Pasta' },
      { id: 'q5', module: 'horen', teil: 2, type: 'multiple_choice', question: 'Was isst der Gast manchmal?', correct: 'b', options: ['a) Pasta', 'b) Fisch', 'c) Fleisch'], explanation: 'manchmal Fisch' },
    ],
  }],
  questions: [], // empty top-level → no conflict possible
};

const cleanChk23 = chk23(CLEAN_PART, 'clean-part');
assert(
  'chk23 emits 0 findings for clean part (empty questions[])',
  cleanChk23.length,
  0,
);

// ── Block 4: conflict in a LESEN part is also caught ─────────────────────────
console.log('\n── Block 4: CHK-23 also catches Lesen parts in publish gate ──');

const LESEN_CONFLICT_PART = {
  id: 'test-lesen-conflict',
  module: 'lesen',
  teil: 1,
  text: 'Ein langer Lesetext für den Test.',
  segments: [{
    questions: [
      { id: 'lq1', module: 'lesen', teil: 1, type: 'richtig_falsch', question: 'Aussage 1.', correct: 'Richtig', explanation: 'ok' },
    ],
  }],
  questions: [
    { id: 'lq1', module: 'lesen', teil: 1, type: 'richtig_falsch', question: 'Aussage 1.', correct: 'Falsch', explanation: 'wrong' },
  ],
};

const lesenConflictExam = {
  exam: {
    lesenParts: [LESEN_CONFLICT_PART],
    horenParts: [],
    schreibenParts: [],
  },
};

const lesenResult = isExamPublishable(lesenConflictExam);

assert(
  'isExamPublishable blocks Lesen exam with CHK-23 conflict',
  lesenResult.ok,
  false,
);
assert(
  'blocking array contains CHK-23 for Lesen conflict',
  lesenResult.blocking.some(f => f.id === 'CHK-23'),
  true,
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`CHK-23 publish gate tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
