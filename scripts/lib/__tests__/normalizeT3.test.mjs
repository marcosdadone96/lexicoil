/**
 * normalizeT3.test.mjs
 * Simple assertion tests — no framework.
 * Run:  node scripts/lib/__tests__/normalizeT3.test.mjs
 * Exit: 0 = all pass, 1 = failure.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeT3 } from '../normalizeT3.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

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
  if (value) { console.log(`  ✅  ${desc}`); passed++; }
  else { console.error(`  ❌  ${desc}: got ${JSON.stringify(value)}`); failed++; }
}

// ── Shared A-J list (used across tests) ──────────────────────────────────────
const ADS_LIST = [
  'A) Schreibcoaching Abends — Di+Do 18–20 Uhr',
  'B) Glanz & Grün — Auto innen/außen, Mo–Fr',
  'C) PC-Hilfe Zuhause — Router, Drucker, ab 35 €',
  'D) Gebrauchtwagen West — Kauf oder Kurzzeitmiete',
  'E) Familienküche Süd — Sonntagsbrunch, 10–14 Uhr',
  'F) Repair-Café Nord — Haushaltsgeräte, Sa 10–13 Uhr',
  'G) Tanzschule Allegro — Paare und Einzel, ab 16',
  'H) Tierarzt am Park — Hausbesuche, Mo–Fr',
  'I) Kinderbetreuung Plus — Mo–Fr 7–18 Uhr',
  'J) TechDeal24 — Gebrauchte Handys, Mo–Sa 10–19 Uhr',
];

function makeT3Batch({ corrects, withWhitespaceDiff = false, withNullCorrectAnswer = false }) {
  const questions = corrects.map((correct, i) => {
    // Optionally add trailing whitespace noise on some options
    const opts = ADS_LIST.map((o) => (withWhitespaceDiff && i % 2 === 1 ? o + '  ' : o));
    return {
      id: `test-t3-q${i + 1}`,
      module: 'lesen',
      teil: 3,
      type: 'matching',
      question: `Situation ${i + 1}`,
      correct,
      correctAnswer: withNullCorrectAnswer ? null : correct,
      options: opts,
      explanation: 'Test explanation.',
    };
  });
  return { passages: [], questions };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

console.log('\n── normalizeT3: uppercase correct ──');
{
  const batch = makeT3Batch({ corrects: ['c', 'a', 'e', 'b', 'f', '0', 'g'] });
  const result = normalizeT3(batch);
  const t3 = result.questions.filter((q) => q.module === 'lesen' && q.teil === 3);

  assert('correct "c" → "C"', t3[0].correct, 'C');
  assert('correct "a" → "A"', t3[1].correct, 'A');
  assert('correct "0" → "0" (unchanged)', t3[5].correct, '0');
  assert('correctAnswer synced with correct', t3[0].correctAnswer, 'C');
}

console.log('\n── normalizeT3: null correctAnswer gets filled ──');
{
  const batch = makeT3Batch({ corrects: ['B', 'D', 'H', '0', 'J'], withNullCorrectAnswer: true });
  const result = normalizeT3(batch);
  const t3 = result.questions.filter((q) => q.module === 'lesen' && q.teil === 3);

  assert('null correctAnswer → "B"', t3[0].correctAnswer, 'B');
  assert('null correctAnswer → "D"', t3[1].correctAnswer, 'D');
  assert('null correctAnswer → "0"', t3[3].correctAnswer, '0');
}

console.log('\n── normalizeT3: type enforced to "matching" ──');
{
  const batch = {
    passages: [],
    questions: [
      { id: 'q1', module: 'lesen', teil: 3, type: 'mcq', correct: 'c', correctAnswer: 'c', options: ADS_LIST.slice() },
    ],
  };
  const result = normalizeT3(batch);
  assert('type "mcq" → "matching"', result.questions[0].type, 'matching');
}

console.log('\n── normalizeT3: whitespace-only option diffs unified ──');
{
  // Build batch where some options have extra trailing spaces
  const batch = makeT3Batch({ corrects: ['A', 'B', 'C', '0', 'E'], withWhitespaceDiff: true });
  const result = normalizeT3(batch);
  const t3 = result.questions.filter((q) => q.module === 'lesen' && q.teil === 3);

  // All items should now share the exact same options array (no trailing spaces)
  const uniqueOpts = new Set(t3.map((q) => JSON.stringify(q.options)));
  assert('all items share identical options after whitespace unification', uniqueOpts.size, 1);
  assertOk('options still have 10 entries', t3[0].options.length === 10);
  assertOk('options NOT empty', t3[0].options.length > 0);
}

console.log('\n── normalizeT3: options NOT emptied (render safety) ──');
{
  const batch = makeT3Batch({ corrects: ['A', 'B', 'C', '0', 'E', 'F', 'G'] });
  const result = normalizeT3(batch);
  const t3 = result.questions.filter((q) => q.module === 'lesen' && q.teil === 3);

  t3.forEach((q, i) => assertOk(`Q${i + 1}: options[] NOT empty (10 entries)`, q.options.length === 10));
  assertOk('no sharedOptions field created', !('sharedOptions' in result));
}

console.log('\n── normalizeT3: real per-item differences left untouched ──');
{
  // Options intentionally differ in content between items (not just whitespace)
  const opts1 = ADS_LIST.slice();
  const opts2 = [...ADS_LIST];
  opts2[7] = 'H) Completely different text for H';  // content diff
  const batch = {
    passages: [],
    questions: [
      { id: 'q1', module: 'lesen', teil: 3, type: 'matching', correct: 'a', correctAnswer: 'a', options: opts1 },
      { id: 'q2', module: 'lesen', teil: 3, type: 'matching', correct: 'b', correctAnswer: 'b', options: opts2 },
    ],
  };
  const result = normalizeT3(batch);
  // Options should NOT be unified (content differs — normalizer leaves them for CHK-17 to flag)
  assert('Q1 H option preserved', result.questions[0].options[7], opts1[7]);
  assert('Q2 H option preserved', result.questions[1].options[7], opts2[7]);
  // Corrects should still be uppercased
  assert('correct still uppercased even in per-item case', result.questions[0].correct, 'A');
}

console.log('\n── normalizeT3: MCQ A2 items (options.length=3) left completely unchanged ──');
{
  const batch = {
    passages: [],
    questions: [
      { id: 'q1', module: 'lesen', teil: 3, type: 'mcq', correct: 'b', correctAnswer: 'b',
        options: ['a) Foo', 'b) Bar', 'c) Baz'] },
      { id: 'q2', module: 'lesen', teil: 3, type: 'matching', correct: 'D', correctAnswer: 'D',
        options: ADS_LIST.slice() },
    ],
  };
  const result = normalizeT3(batch);
  // MCQ A2 item (3 opts) should pass through unchanged
  assert('MCQ A2: type unchanged', result.questions[0].type, 'mcq');
  assert('MCQ A2: correct unchanged', result.questions[0].correct, 'b');
  assert('MCQ A2: options.length unchanged', result.questions[0].options.length, 3);
  // Matching item still normalizes
  assert('matching item: correct unchanged (already uppercase)', result.questions[1].correct, 'D');
}

console.log('\n── normalizeT3: non-L3 questions untouched ──');
{
  const batch = {
    passages: [],
    questions: [
      { id: 'rf', module: 'lesen', teil: 1, type: 'richtig_falsch', correct: 'Richtig', options: [] },
      { id: 't3', module: 'lesen', teil: 3, type: 'matching', correct: 'c', correctAnswer: null, options: ADS_LIST.slice() },
    ],
  };
  const result = normalizeT3(batch);
  assert('L1 richtig_falsch unchanged', result.questions[0].correct, 'Richtig');
  assert('L3 correct uppercased', result.questions[1].correct, 'C');
}

// ── Integration: CHK-17 should NOT emit "MCQ-style" for canonical format ──────

console.log('\n── Integration: CHK-17 "MCQ-style" finding absent after normalizeT3 ──');
{
  const batch = makeT3Batch({ corrects: ['A', 'B', '0', 'D', 'E', 'F', 'G'], withNullCorrectAnswer: true });
  const normalized = normalizeT3(batch);

  const fs = await import('node:fs');
  const tmpFile = path.join(ROOT, 'tmp-t3-test.json');
  fs.default.writeFileSync(tmpFile, JSON.stringify(normalized), 'utf8');

  const r = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/audit-pass-2.mjs'), tmpFile,
  ], { encoding: 'utf8' });

  fs.default.rmSync(tmpFile, { force: true });

  const output = r.stdout + r.stderr;
  const hasMcqStyle = /MCQ-style|opciones por ítem/.test(output);
  assertOk('no "MCQ-style" CHK-17 finding after normalizeT3', !hasMcqStyle);

  // Content-only findings (repeated letter or missing 0) are OK — this batch has no repeats & has 0
  const hasChk17 = /CHK-17/.test(output);
  assertOk('no CHK-17 findings at all (valid content + canonical format)', !hasChk17);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
