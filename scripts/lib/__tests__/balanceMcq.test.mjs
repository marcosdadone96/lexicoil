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

console.log('\n── v1.1 seed remainder rotate (N=4 / N=5 / N=6) ──');
{
  function countLetters(arr) {
    const c = { a: 0, b: 0, c: 0 };
    for (const x of arr) c[x]++;
    return c;
  }
  function remainderWinner(counts, n) {
    const base = Math.floor(n / 3);
    const winners = [];
    for (const L of ['a', 'b', 'c']) {
      if (counts[L] > base) winners.push(L);
    }
    return winners.sort().join('');
  }

  const rem4 = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 25; i++) {
    const c = countLetters(buildBalancedLetterTargets(4, `lesen-t5-sim-${i}`));
    assertOk(`N=4 seed ${i}: counts sum 4 and max-min≤1`, c.a + c.b + c.c === 4 && Math.max(c.a, c.b, c.c) - Math.min(c.a, c.b, c.c) <= 1);
    for (const L of remainderWinner(c, 4)) rem4[L]++;
  }
  console.log('  N=4×25 remainder hits', rem4);
  assertOk('N=4×25: remainder not always a', rem4.a < 25);
  assertOk('N=4×25: each letter gets some remainder', rem4.a > 0 && rem4.b > 0 && rem4.c > 0);
  assertOk(
    'N=4×25: remainder fairly even (each 5–12)',
    rem4.a >= 5 && rem4.a <= 12 && rem4.b >= 5 && rem4.b <= 12 && rem4.c >= 5 && rem4.c <= 12,
  );

  const rem5 = { a: 0, b: 0, c: 0 };
  // N=5 → two letters get +1; count each letter's extras
  const extras5 = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 19; i++) {
    const c = countLetters(buildBalancedLetterTargets(5, `horen-t2-sim-${i}`));
    assertOk(`N=5 seed ${i}: 2/2/1 shape`, [c.a, c.b, c.c].sort().join(',') === '1,2,2');
    for (const L of ['a', 'b', 'c']) {
      if (c[L] === 2) extras5[L]++;
      if (c[L] === 1) rem5[L]++; // short letter
    }
  }
  console.log('  N=5×19 short-letter hits (should rotate)', rem5);
  console.log('  N=5×19 double-letter hits', extras5);
  assertOk('N=5×19: c is not always the short letter', rem5.c < 19);
  assertOk('N=5×19: each letter is short at least once', rem5.a > 0 && rem5.b > 0 && rem5.c > 0);

  for (const seed of ['t2-a', 't2-b', 't2-c', 'lesen-t2-sim-0']) {
    const c = countLetters(buildBalancedLetterTargets(6, seed));
    assertOk(`N=6 seed ${seed}: still 2/2/2`, c.a === 2 && c.b === 2 && c.c === 2);
  }
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
  assertOk('L4 ja_nein shuffle changes positional sequence', seq !== canonical);
  assert(
    'L4 shuffle preserves multiset of answers',
    seq.split(',').sort().join(','),
    canonical.split(',').sort().join(','),
  );
}
{
  const input = Array.from({ length: 7 }, (_, i) => ({
    id: `rf${i + 1}`,
    type: 'richtig_falsch',
    passageId: 'dialog-1',
    correct: ['Richtig', 'Falsch', 'Richtig', 'Falsch', 'Richtig', 'Falsch', 'Richtig'][i],
    question: `Statement ${i + 1}`,
  }));
  const before = input.map((q) => q.id).join(',');
  const out = shuffleKeyedQuestionOrder(input, { seed: 'horen-t3-chrono' });
  const after = out.map((q) => q.id).join(',');
  assert('R/F order preserved (no chrono shuffle)', after, before);
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
