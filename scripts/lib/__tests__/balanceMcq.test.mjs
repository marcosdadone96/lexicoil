/**
 * balanceMcq.test.mjs
 * Run:  node scripts/lib/__tests__/balanceMcq.test.mjs
 */

import {
  balanceMcqGroup,
  antiRuns,
  buildBalancedLetterTargets,
  derivePartShuffleSeed,
  seededShuffle,
  shuffleKeyedQuestionOrder,
} from '../balanceMcq.mjs';

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
    failed++;
  }
}

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
    _correctText: texts[idx],
  };
}

console.log('\n── buildBalancedLetterTargets ──');
{
  const t6 = buildBalancedLetterTargets(6, 'test-seed');
  assert('6 targets', t6.length, 6);
  assertOk('6 targets are permutation of 2×a,2×b,2×c', t6.sort().join('') === 'aabbcc');
  assertOk('6 targets not fixed abcabc', t6.join(',') !== 'a,b,c,a,b,c');
}

console.log('\n── balanceMcqGroup ──');
{
  const input = Array.from({ length: 6 }, (_, i) =>
    mcq(`q${i + 1}`, 'a', [`F${i}`, `B${i}`, `G${i}`]),
  );
  const result = balanceMcqGroup(input, { seed: 'part-a' });
  const dist = { a: 0, b: 0, c: 0 };
  result.forEach((q) => { const l = String(q.correct).toLowerCase(); if (dist[l] !== undefined) dist[l]++; });
  assertOk('6 Qs balanced (a present)', dist.a === 2);
  assertOk('6 Qs balanced (b present)', dist.b === 2);
  assertOk('6 Qs balanced (c present)', dist.c === 2);
  const seq = result.map((q) => q.correct).join(',');
  assertOk('6 Qs sequence not abcabc', seq !== 'a,b,c,a,b,c');

  const resultB = balanceMcqGroup(input, { seed: 'part-b' });
  const seqB = resultB.map((q) => q.correct).join(',');
  assertOk('different seed → different sequence', seqB !== seq);

  const resultAgain = balanceMcqGroup(input, { seed: 'part-a' });
  assert('same seed → same sequence', resultAgain.map((q) => q.correct).join(','), seq);
}

{
  const input = [
    mcq('q1', 'b', ['One', 'Two', 'Three']),
    mcq('q2', 'b', ['X', 'Y', 'Z']),
    mcq('q3', 'b', ['P', 'Q', 'R']),
  ];
  const result = balanceMcqGroup(input, { seed: 'triplet' });
  const letters = result.map((q) => String(q.correct).toLowerCase()).sort();
  assert('3 Qs → one of each letter', letters.join(''), 'abc');
}

{
  const rf = { id: 'rf1', type: 'richtig_falsch', correct: 'Richtig', correctAnswer: 'Richtig', options: [] };
  const jn = { id: 'jn1', type: 'ja_nein', correct: 'Ja', correctAnswer: 'Ja', options: ['a) Ja', 'b) Nein'] };
  const m  = { id: 'm1',  type: 'matching',  correct: 'b', correctAnswer: 'b', options: ['a) X', 'b) Y', 'c) Z'] };
  const input = [rf, jn, m, mcq('q1', 'c', ['W', 'X', 'Y'])];
  const result = balanceMcqGroup(input, { seed: 'mixed' });
  assert('richtig_falsch unchanged', result[0].correct, 'Richtig');
  assert('ja_nein unchanged by balanceMcq', result[1].correct, 'Ja');
  assert('matching unchanged', result[2].correct, 'b');
}

console.log('\n── shuffleKeyedQuestionOrder ──');
{
  const input = Array.from({ length: 7 }, (_, i) => ({
    id: `q${i + 1}`,
    type: 'ja_nein',
    passageId: 'forum-1',
    correct: ['Ja', 'Nein', 'Ja', 'Nein', 'Ja', 'Nein', 'Nein'][i],
    correctAnswer: ['Ja', 'Nein', 'Ja', 'Nein', 'Ja', 'Nein', 'Nein'][i],
    signText: `Opinion ${i}`,
  }));
  const canonical = input.map((q) => q.correct).join(',');
  const shuffled = shuffleKeyedQuestionOrder(input, { seed: 'l4-test' });
  const seq = shuffled.map((q) => q.correct).join(',');
  assertOk('L4 shuffle changes positional sequence', seq !== canonical);
  assertOk('L4 shuffle preserves multiset of answers', seq.split(',').sort().join(','), canonical.split(',').sort().join(','));
}

console.log('\n── antiRuns ──');
{
  const qs = Array.from({ length: 6 }, (_, i) =>
    mcq(`r${i + 1}`, 'b', [`A${i}`, `B${i}`, `C${i}`]),
  );
  const result = antiRuns(qs, 4);
  let maxRun = 1; let curRun = 1;
  for (let i = 1; i < result.length; i++) {
    if (result[i].correct === result[i - 1].correct) { curRun++; maxRun = Math.max(maxRun, curRun); }
    else { curRun = 1; }
  }
  assertOk('no run ≥ 4 after antiRuns', maxRun < 4);
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
