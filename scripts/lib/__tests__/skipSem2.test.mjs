/**
 * skipSem2.test.mjs — SEM-2 omitido cuando skipSem2:true en isPartPoolReady.
 * Run: node scripts/lib/__tests__/skipSem2.test.mjs
 */
import { _setHolisticJudgeLlmFn } from '../holisticJudge.mjs';
import { isPartPoolReady } from '../../audit-pass-2.mjs';

let sem2Calls = 0;
_setHolisticJudgeLlmFn(async () => {
  sem2Calls += 1;
  return JSON.stringify({ themeTags: [], findings: [] });
});

const l2Batch = {
  module: 'lesen',
  teil: 2,
  passages: [{
    id: 'p1',
    title: 'Test',
    text: 'Die Stadt plant neue Radwege. Viele Menschen fahren gerne Fahrrad.',
  }],
  questions: [{
    id: 'q1',
    type: 'multiple_choice',
    module: 'lesen',
    teil: 2,
    passageId: 'p1',
    question: 'Worum geht es?',
    options: ['a) Radwege', 'b) Schulen', 'c) Parks'],
    correct: 'a',
    explanation: 'Radwege stehen im Text.',
  }],
};

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

console.log('\n── skipSem2 ──');

await test('skipSem2:true no invoca SEM-2 LLM (mock)', async () => {
  sem2Calls = 0;
  const semMod = await import('../semanticValidator.mjs');
  const orig = semMod._setLlmFn;
  semMod._setLlmFn(async () => JSON.stringify({ themeTags: ['test'], issues: [] }));
  try {
    await isPartPoolReady(l2Batch, { semantic: true, skipSem2: true });
  } finally {
    semMod._setLlmFn(orig);
  }
  if (sem2Calls !== 0) throw new Error(`sem2Calls=${sem2Calls}, expected 0`);
});

console.log(`\n══ ${passed} passed, ${failed} failed ══\n`);
process.exit(failed ? 1 : 0);
