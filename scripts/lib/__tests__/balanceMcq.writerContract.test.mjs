#!/usr/bin/env node
/**
 * balanceMcq writer-contract tests.
 *  - Happy path: balanceMcqGroup preserves contracts a/b/c
 *  - Forced violations: assertBalanceMcqWriterContract rejects before "save"
 *
 *   node scripts/lib/__tests__/balanceMcq.writerContract.test.mjs
 */
import {
  balanceMcqGroup,
  assertBalanceMcqWriterContract,
  stripMcqOptionLabel,
} from '../balanceMcq.mjs';

let passed = 0;
let failed = 0;

function ok(desc) {
  console.log(`  ✅  ${desc}`);
  passed++;
}
function fail(desc, detail) {
  console.error(`  ❌  ${desc}`);
  if (detail) console.error(`       ${detail}`);
  failed++;
}

function mcq(id, correct, texts, explanation) {
  const letter = String(correct).toLowerCase();
  return {
    id,
    type: 'multiple_choice',
    options: texts.map((t, i) => `${String.fromCharCode(97 + i)}) ${t}`),
    correct: letter,
    correctAnswer: letter,
    explanation:
      explanation ||
      `Die richtige Antwort ist Option ${letter}, weil der Text das so sagt.`,
  };
}

const base = [
  mcq('q1', 'a', ['Alpha', 'Beta', 'Gamma']),
  mcq('q2', 'b', ['Rot', 'Grün', 'Blau']),
  mcq('q3', 'c', ['Eins', 'Zwei', 'Drei']),
];

console.log('\n── happy path: balanceMcqGroup honors contract ──');
{
  const before = structuredClone(base);
  const after = balanceMcqGroup(structuredClone(base), { seed: 'contract-happy' });
  try {
    assertBalanceMcqWriterContract(before, after, { label: 'test-happy' });
    ok('assert passes on real balanceMcqGroup output');
  } catch (err) {
    fail('assert passes on real balanceMcqGroup output', err.message);
  }
  // bodies preserved
  for (let i = 0; i < before.length; i++) {
    const b = before[i].options.map(stripMcqOptionLabel).sort().join('|');
    const a = after[i].options.map(stripMcqOptionLabel).sort().join('|');
    if (b === a) ok(`q${i + 1} option bodies unchanged`);
    else fail(`q${i + 1} option bodies unchanged`, `${b} vs ${a}`);
  }
}

console.log('\n── forced violation (a): option text mutated ──');
{
  const before = structuredClone(base);
  const after = balanceMcqGroup(structuredClone(base), {
    seed: 'contract-a',
    skipContract: true,
  });
  // Mutate body of option 0
  after[0].options[0] = after[0].options[0].replace(/\)\s*.+$/, ') HACKED');
  let threw = false;
  try {
    assertBalanceMcqWriterContract(before, after, { label: 'force-a' });
  } catch (err) {
    threw = /contract:a/.test(err.message);
    if (threw) ok(`rejects text mutation: ${err.message.split('\n')[0]}`);
    else fail('rejects text mutation', err.message);
  }
  if (!threw) fail('rejects text mutation', 'no throw');
}

console.log('\n── forced violation (b): correct body drifted ──');
{
  const before = structuredClone(base);
  const after = balanceMcqGroup(structuredClone(base), {
    seed: 'contract-b',
    skipContract: true,
  });
  // Keep option bodies but point correct at a different body without rotating
  after[1].correct = 'a';
  after[1].correctAnswer = 'a';
  // Ensure explanation still says old letter so we isolate contract:b
  after[1].explanation = 'Die richtige Antwort ist Option a.';
  let threw = false;
  try {
    assertBalanceMcqWriterContract(before, after, { label: 'force-b' });
  } catch (err) {
    threw = /contract:b/.test(err.message);
    if (threw) ok(`rejects correct-body drift: ${err.message.split('\n')[0]}`);
    else fail('rejects correct-body drift', err.message);
  }
  if (!threw) fail('rejects correct-body drift', 'no throw');
}

console.log('\n── forced violation (c): explanation letter stale ──');
{
  const before = structuredClone(base);
  const after = balanceMcqGroup(structuredClone(base), {
    seed: 'contract-c',
    skipContract: true,
  });
  // Force desync: leave explanation pointing at wrong letter
  const want = String(after[2].correct).toLowerCase();
  const stale = want === 'a' ? 'b' : 'a';
  after[2].explanation = `Laut Text ist Option ${stale} korrekt.`;
  let threw = false;
  try {
    assertBalanceMcqWriterContract(before, after, { label: 'force-c' });
  } catch (err) {
    threw = /contract:c/.test(err.message);
    if (threw) ok(`rejects stale explanation letter: ${err.message.split('\n')[0]}`);
    else fail('rejects stale explanation letter', err.message);
  }
  if (!threw) fail('rejects stale explanation letter', 'no throw');
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
