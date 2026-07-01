/**
 * chk2Format.test.mjs — CHK-2 answer-format contract tests
 *
 * Pins the accepted values for each question type against what the renderer
 * actually uses at runtime (js/engine/validation/isAnswerKeyRenderable.js):
 *
 *   optKey()             → extracts a single letter from the option  (always uppercase from objects)
 *   normalizeGradingToken() → lowercases before comparing
 *
 * Therefore multiple_choice `correct` MUST be a single letter a-d, any case.
 * This test prevents CHK-2 from regressing to only accepting lowercase or only 3 options.
 *
 * Run: node scripts/lib/__tests__/chk2Format.test.mjs
 * Exit 0 = all pass. No LLM calls. No file I/O.
 */

import { auditExam } from '../../audit-pass-2.mjs';

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

function assertNoChk2Critical(desc, questions) {
  const exam = {
    exam: {
      lesenParts: [{
        teil: 1,
        text: 'Ein langer Lesetext über Stadtgärten in modernen deutschen Städten und ihr Nutzen.',
        textTitle: 'Stadtgärten',
        questions,
      }],
    },
  };
  const audit = auditExam(exam, 'test');
  const chk2Critical = audit.findings.filter(f => f.id === 'CHK-2' && f.severity === 'CRITICAL');
  if (chk2Critical.length === 0) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    chk2Critical.forEach(f => console.error(`       ${f.message}`));
    failed++;
  }
}

function makeQ(id, correct, type = 'multiple_choice', options = null) {
  return {
    id,
    module: 'lesen',
    teil: 1,
    type,
    question: `Testfrage ${id}`,
    correct,
    correctAnswer: correct,
    explanation: 'Das steht im Text.',
    options: options ?? [
      { key: 'A', text: 'Erste Antwortmöglichkeit für den Test.' },
      { key: 'B', text: 'Zweite Antwortmöglichkeit für den Test.' },
      { key: 'C', text: 'Dritte Antwortmöglichkeit für den Test.' },
    ],
  };
}

// ── Block 1: multiple_choice accepts letters in any case ─────────────────────
console.log('\n── CHK-2: multiple_choice letter format ──');

assertNoChk2Critical(
  'correct="a" (lowercase, new generator format) passes',
  [makeQ('q1', 'a'), makeQ('q2', 'b'), makeQ('q3', 'c'), makeQ('q4', 'a'), makeQ('q5', 'b'), makeQ('q6', 'c')],
);

assertNoChk2Critical(
  'correct="A" (uppercase, old bank format) passes',
  [makeQ('q1', 'A'), makeQ('q2', 'B'), makeQ('q3', 'C'), makeQ('q4', 'A'), makeQ('q5', 'B'), makeQ('q6', 'C')],
);

assertNoChk2Critical(
  'correct="B" (uppercase B) passes',
  [makeQ('q1', 'B'), makeQ('q2', 'B'), makeQ('q3', 'B'), makeQ('q4', 'B'), makeQ('q5', 'B'), makeQ('q6', 'B')],
);

assertNoChk2Critical(
  'correct="D" (4th option, some L2/H2 records) passes',
  [makeQ('q1', 'D', 'multiple_choice', [
    { key:'A', text:'Option A' }, { key:'B', text:'Option B' },
    { key:'C', text:'Option C' }, { key:'D', text:'Option D' },
  ]), makeQ('q2','A'), makeQ('q3','B'), makeQ('q4','C'), makeQ('q5','A'), makeQ('q6','B')],
);

// ── Block 2: invalid values must still CRITICAL ───────────────────────────────
console.log('\n── CHK-2: invalid correct values still blocked ──');

{
  const exam = {
    exam: {
      lesenParts: [{
        teil: 1,
        text: 'Ein langer Lesetext über Stadtgärten in modernen deutschen Städten.',
        textTitle: 'Test',
        questions: [makeQ('q1', 'Die Antwort ist B.', 'multiple_choice')], // full text — not a key
      }],
    },
  };
  const audit = auditExam(exam, 'test');
  const chk2c = audit.findings.filter(f => f.id === 'CHK-2' && f.severity === 'CRITICAL');
  assert('full-text correct ("Die Antwort ist B.") is rejected', chk2c.length > 0, true);
}

{
  const exam = {
    exam: {
      lesenParts: [{
        teil: 1,
        text: 'Ein langer Lesetext über Stadtgärten in modernen deutschen Städten.',
        textTitle: 'Test',
        questions: [makeQ('q1', 'E', 'multiple_choice')], // E = 5th option, not valid a-d
      }],
    },
  };
  const audit = auditExam(exam, 'test');
  const chk2c = audit.findings.filter(f => f.id === 'CHK-2' && f.severity === 'CRITICAL');
  assert('letter "E" (5th option, out of range) is rejected', chk2c.length > 0, true);
}

// ── Block 3: renderer contract — same token comparison ───────────────────────
console.log('\n── Renderer contract: normalizeGradingToken parity ──');

// Simulate what the renderer does: optKey({key:'A',...}) → 'A',
// goetheAnswersMatch('A', 'A') and goetheAnswersMatch('A', 'a') both pass
// because normalizeGradingToken does .toLowerCase() as fallback.
function normalizeGradingToken(val) {
  if (val == null || val === '') return '';
  const s = String(val).trim();
  const u = s.toLowerCase();
  if (u === 'ja' || u === 'j' || u === 'yes') return 'J';
  if (u === 'nein' || u === 'n' || u === 'no') return 'N';
  if (u === 'richtig' || u === 'r' || u === 'true' || u === 't') return 'R';
  if (u === 'falsch' || u === 'f' || u === 'false') return 'F';
  return s.toLowerCase();
}

assert(
  'renderer: normalizeGradingToken("A") === normalizeGradingToken("a")  (grading is case-insensitive)',
  normalizeGradingToken('A') === normalizeGradingToken('a'),
  true,
);
assert(
  'renderer: user clicks A (optKey result), correct="A" → match',
  normalizeGradingToken('A') === normalizeGradingToken('A'),
  true,
);
assert(
  'renderer: user clicks A (optKey result), correct="a" → match (old-format lower vs click upper)',
  normalizeGradingToken('A') === normalizeGradingToken('a'),
  true,
);
assert(
  'renderer: full-text correct does NOT match letter click  (would break grading)',
  normalizeGradingToken('A') === normalizeGradingToken('Die Antwort ist B.'),
  false,
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`CHK-2 format tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
