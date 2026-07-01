/**
 * balanceMcq.test.mjs
 * Simple assertion tests — no framework.
 * Run:  node scripts/lib/__tests__/balanceMcq.test.mjs
 * Exit: 0 = all pass, 1 = failure.
 */

import { balanceMcqGroup, antiRuns } from '../balanceMcq.mjs';

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

function assertOk(desc, value) {
  if (value) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    console.error(`       expected truthy, got: ${JSON.stringify(value)}`);
    failed++;
  }
}

// Helper: build a 3-option MCQ question
function mcq(id, correct, texts = ['Alpha', 'Beta', 'Gamma']) {
  const letter = correct.toLowerCase();
  const idx = letter.charCodeAt(0) - 97;
  const opts = texts.map((t, i) => {
    const l = String.fromCharCode(97 + i);
    return `${l}) ${t}`;
  });
  return {
    id,
    type: 'multiple_choice',
    correct,
    correctAnswer: correct,
    options: opts,
    _correctText: texts[idx],  // store what the correct text should be for verification
  };
}

// ─── balanceMcqGroup ─────────────────────────────────────────────────────────

console.log('\n── balanceMcqGroup ──');

// 5 questions all with correct="a" → after balance, 3 letters appear, none >55%
{
  const input = [
    mcq('q1', 'a', ['Foo', 'Bar', 'Baz']),
    mcq('q2', 'a', ['Cat', 'Dog', 'Elk']),
    mcq('q3', 'a', ['Red', 'Blue', 'Green']),
    mcq('q4', 'a', ['Sun', 'Moon', 'Star']),
    mcq('q5', 'a', ['Cup', 'Plate', 'Bowl']),
  ];
  const result = balanceMcqGroup(input);

  const dist = { a: 0, b: 0, c: 0 };
  result.forEach((q) => { const l = String(q.correct).toLowerCase(); if (dist[l] !== undefined) dist[l]++; });
  const total = result.length;

  assertOk('all 3 letters appear (a)', dist.a > 0);
  assertOk('all 3 letters appear (b)', dist.b > 0);
  assertOk('all 3 letters appear (c)', dist.c > 0);
  assertOk('no letter > 55%', Math.max(dist.a, dist.b, dist.c) / total <= 0.55);

  // Verify text of correct option is unchanged
  result.forEach((q, i) => {
    const letter = q.correct.toLowerCase();
    const idx = letter.charCodeAt(0) - 97;
    const correctText = q.options[idx].replace(/^[a-c]\)\s*/, '');
    assert(`q${i + 1}: correct option text preserved`, correctText, input[i]._correctText);
  });
}

// 3 questions → exactly 1 per letter
{
  const input = [
    mcq('q1', 'b', ['One', 'Two', 'Three']),
    mcq('q2', 'b', ['X', 'Y', 'Z']),
    mcq('q3', 'b', ['P', 'Q', 'R']),
  ];
  const result = balanceMcqGroup(input);
  const letters = result.map((q) => String(q.correct).toLowerCase());
  assert('3 Qs → exactly "a"', letters[0], 'a');
  assert('3 Qs → exactly "b"', letters[1], 'b');
  assert('3 Qs → exactly "c"', letters[2], 'c');
}

// Non-MCQ questions pass through unchanged
{
  const rf = { id: 'rf1', type: 'richtig_falsch', correct: 'Richtig', correctAnswer: 'Richtig', options: [] };
  const jn = { id: 'jn1', type: 'ja_nein', correct: 'Ja', correctAnswer: 'Ja', options: ['a) Ja', 'b) Nein'] };
  const m  = { id: 'm1',  type: 'matching',  correct: 'b', correctAnswer: 'b', options: ['a) X', 'b) Y', 'c) Z'] };
  const input = [rf, jn, m, mcq('q1', 'c', ['W', 'X', 'Y'])];
  const result = balanceMcqGroup(input);

  assert('richtig_falsch unchanged correct', result[0].correct, 'Richtig');
  assert('ja_nein unchanged correct', result[1].correct, 'Ja');
  assert('matching unchanged correct', result[2].correct, 'b');
  assert('MCQ gets target "a" (rank 0)', String(result[3].correct).toLowerCase(), 'a');
}

// Empty / null safety
{
  assert('empty array → empty', JSON.stringify(balanceMcqGroup([])), '[]');
  assert('null → null', balanceMcqGroup(null), null);
}

// ─── antiRuns ────────────────────────────────────────────────────────────────

console.log('\n── antiRuns ──');

// 6 identical correct answers → run broken (no run ≥ 4 after fix)
{
  // Build questions all with correct="b" but varying correct slot indices so
  // options aren't identical strings
  const qs = [
    mcq('r1', 'b', ['A', 'B', 'C']),
    mcq('r2', 'b', ['D', 'E', 'F']),
    mcq('r3', 'b', ['G', 'H', 'I']),
    mcq('r4', 'b', ['J', 'K', 'L']),
    mcq('r5', 'b', ['M', 'N', 'O']),
    mcq('r6', 'b', ['P', 'Q', 'R']),
  ];
  const result = antiRuns(qs, 4);

  // Check no run of ≥4 consecutive identical answers
  let maxRun = 1, curRun = 1;
  for (let i = 1; i < result.length; i++) {
    if (result[i].correct === result[i - 1].correct) { curRun++; maxRun = Math.max(maxRun, curRun); }
    else { curRun = 1; }
  }
  assertOk('no run ≥ 4 after antiRuns', maxRun < 4);
}

// No false-positive: 3 identical in a row is fine
{
  const qs = [mcq('x1','a',['A','B','C']), mcq('x2','a',['D','E','F']), mcq('x3','a',['G','H','I']), mcq('x4','b',['J','K','L'])];
  const result = antiRuns(qs, 4);
  // First 3 are "a" — no run ≥ 4 → should remain unchanged
  assert('3 identical fine → still a', result[0].correct.toLowerCase(), 'a');
  assert('3 identical fine → still a', result[1].correct.toLowerCase(), 'a');
  assert('3 identical fine → still a', result[2].correct.toLowerCase(), 'a');
}

// ─── Combined ─────────────────────────────────────────────────────────────────

console.log('\n── balanceMcqGroup + antiRuns combined ──');
{
  // 10 questions (Hören T1 MCQ part) all with correct="b"
  const qs = Array.from({ length: 10 }, (_, i) =>
    mcq(`h${i + 1}`, 'b', [`Opt${i}A`, `Opt${i}B`, `Opt${i}C`])
  );
  const balanced = balanceMcqGroup(qs);
  const final = antiRuns(balanced, 4);

  const dist = { a: 0, b: 0, c: 0 };
  final.forEach((q) => { const l = String(q.correct).toLowerCase(); if (dist[l] !== undefined) dist[l]++; });
  const total = final.length;

  assertOk('H1 10q → a present', dist.a > 0);
  assertOk('H1 10q → b present', dist.b > 0);
  assertOk('H1 10q → c present', dist.c > 0);
  assertOk('H1 10q → no letter > 55%', Math.max(dist.a, dist.b, dist.c) / total <= 0.55);

  // Check correct option text is preserved for each item
  final.forEach((q, i) => {
    const letter = q.correct.toLowerCase();
    const idx = letter.charCodeAt(0) - 97;
    const actualText = q.options[idx].replace(/^[a-c]\)\s*/, '');
    assert(`H1 q${i + 1}: correct text preserved`, actualText, `Opt${i}B`);
  });
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
