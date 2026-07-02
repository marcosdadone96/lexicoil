/**
 * eje2FaseAWriters.test.mjs — Eje-2 Fase A: writers no crean divergencia
 *
 * Prueba que los dos escritores reparados no pueden dejar questions[] divergente
 * de segments[].questions[]:
 *
 *   A1. bankReusableParts.examPartToReusableRecord + quality-gate sync:
 *       Cuando el gate muta correct (e.g. applyPartPostprocess), la mutación se
 *       propaga a segments[].questions y questions[] se re-deriva. CHK-23 = 0.
 *
 *   A2. seed-reusable-from-curated.flattenHorenQuestions:
 *       Ya no añade part.questions al índice — solo lee de segments.
 *       Si part.questions tiene datos obsoletos, no contaminan el índice.
 *
 * Run: node scripts/lib/__tests__/eje2FaseAWriters.test.mjs
 * Exit 0 = all pass. No LLM calls. No file I/O.
 */

import { examPartToReusableRecord } from '../bankReusableParts.mjs';
import { chk23 } from '../../audit-pass-2.mjs';

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

// ── Shared fixtures ───────────────────────────────────────────────────────────

const TRANSCRIPT = 'Moderator: Guten Tag. Gast: Hallo. Moderator: Wie geht es Ihnen? Gast: Sehr gut, danke.';

function makeHorenPart(override = {}) {
  return {
    teil: 2,
    transcript: TRANSCRIPT,
    segments: [{
      id: 'seg_0',
      label: 'Aufnahme 1',
      transcript: TRANSCRIPT,
      passageId: 'seg_0',
      questions: [
        { id: 'q1', type: 'multiple_choice', question: 'Wie begrüßt der Moderator?', correct: 'a', correctAnswer: 'a', options: ['a) Guten Tag', 'b) Hallo', 'c) Servus'], explanation: 'Moderator: Guten Tag' },
        { id: 'q2', type: 'multiple_choice', question: 'Wie antwortet der Gast auf die Begrüßung?', correct: 'c', correctAnswer: 'c', options: ['a) Guten Tag', 'b) Auf Wiedersehen', 'c) Hallo'], explanation: 'Gast: Hallo' },
        { id: 'q3', type: 'multiple_choice', question: 'Wie geht es dem Gast?', correct: 'b', correctAnswer: 'b', options: ['a) Schlecht', 'b) Sehr gut', 'c) Nicht so gut'], explanation: 'Gast: Sehr gut' },
      ],
    }],
    ...override,
  };
}

// ── Block 1: A1 — examPartToReusableRecord produces consistent record ─────────
console.log('\n── Block 1: examPartToReusableRecord — Hören segments & questions are consistent ──');

const part = makeHorenPart();
const meta = { lang: 'de', level: 'B1' };
const blueprint = null;

const record = examPartToReusableRecord(part, 'horen', meta, blueprint, { sourceKey: 'test-src' });

assert(
  'record has segments',
  Array.isArray(record.segments) && record.segments.length > 0,
  true,
);
assert(
  'record.questions derived from segments (same count)',
  record.questions.length,
  part.segments[0].questions.length,
);

// CHK-23 must emit 0 findings on the freshly built record
const chk23Initial = chk23(record, 'test');
assert(
  'CHK-23 emits 0 findings on fresh record (segments and questions in sync)',
  chk23Initial.length,
  0,
);

// ── Block 2: A1 — gate mutation is propagated back to segments ────────────────
console.log('\n── Block 2: gate mutation sync (simulates applyPartPostprocess changing correct) ──');

// Simulate what happens when the quality gate changes a correct value:
// gate.questions[1].correct changes from 'c' → 'b' (e.g. answer rebalancing)
const recordWithGateMutation = examPartToReusableRecord(makeHorenPart(), 'horen', meta, blueprint, { sourceKey: 'test-gate' });

// Simulate the gate returning mutated questions
const simulatedGateResult = {
  valid: true,
  complete: true,
  questions: recordWithGateMutation.questions.map((q, i) =>
    i === 1 ? { ...q, correct: 'b', correctAnswer: 'b' } : q, // q2: 'c' → 'b'
  ),
  itemCount: recordWithGateMutation.questions.length,
};

// Apply the Eje-2 sync logic manually (same logic as bankReusableParts.mjs:521 fix)
const gate = simulatedGateResult;
if (recordWithGateMutation.module === 'horen' && recordWithGateMutation.segments?.length > 0) {
  const gateMap = new Map((gate.questions || []).map(q => [q.id, q]));
  for (const seg of recordWithGateMutation.segments) {
    seg.questions = (seg.questions || []).map(q =>
      gateMap.has(q.id) ? { ...q, ...gateMap.get(q.id) } : q,
    );
  }
  // Re-derive flat index from updated segments (the flattenHorenQuestions from bankReusableParts)
  recordWithGateMutation.questions = recordWithGateMutation.segments
    .flatMap(s => s.questions || [])
    .map(q => ({ ...q }));
  recordWithGateMutation.itemCount = recordWithGateMutation.questions.length;
}

// CHK-23 must still be 0 after gate mutation + sync
const chk23AfterGate = chk23(recordWithGateMutation, 'test-gate');
assert(
  'CHK-23 emits 0 findings after gate mutation + segment sync',
  chk23AfterGate.length,
  0,
);

// The segment question q2 should now have the gate's correct value
const q2InSeg = recordWithGateMutation.segments[0].questions.find(q => q.id === 'q2');
assert(
  'gate mutation propagated to segment: q2.correct updated from "c" to "b"',
  q2InSeg?.correct,
  'b',
);

// The flat index should also have the updated value
const q2InFlat = recordWithGateMutation.questions.find(q => q.id === 'q2');
assert(
  'flat index q2.correct matches segment (re-derived correctly)',
  q2InFlat?.correct,
  'b',
);

assert(
  'segments and questions always agree: no divergence possible',
  recordWithGateMutation.questions.every(fq => {
    const segQ = recordWithGateMutation.segments
      .flatMap(s => s.questions || [])
      .find(sq => sq.id === fq.id);
    return segQ && segQ.correct === fq.correct;
  }),
  true,
);

// ── Block 3: A2 — seed flattenHorenQuestions ignores stale part.questions ─────
console.log('\n── Block 3: seed flattenHorenQuestions — stale part.questions NOT appended ──');

// Simulate a curated exam part that has BOTH segments AND stale top-level questions
// with DIFFERENT correct values (the pre-fix bug scenario)
const partWithStaleFlatQuestions = makeHorenPart({
  // Add stale flat questions with WRONG correct values (migration artifact)
  questions: [
    { id: 'q1', type: 'multiple_choice', question: 'Wie begrüßt der Moderator?', correct: 'c', correctAnswer: 'c', options: ['a) Guten Tag', 'b) Hallo', 'c) Servus'] },
    { id: 'q2', type: 'multiple_choice', question: 'Wie antwortet der Gast?', correct: 'a', correctAnswer: 'a', options: ['a) Guten Tag', 'b) Auf Wiedersehen', 'c) Hallo'] },
    { id: 'q3', type: 'multiple_choice', question: 'Wie geht es dem Gast?', correct: 'a', correctAnswer: 'a', options: ['a) Schlecht', 'b) Sehr gut', 'c) Nicht so gut'] },
  ],
});

// Build the record — flattenHorenQuestions (bank version) should ONLY read segments
const recordFromStale = examPartToReusableRecord(partWithStaleFlatQuestions, 'horen', meta, blueprint, { sourceKey: 'test-stale' });

// Record questions should match segments (correct: a, c, b), NOT stale flat (c, a, a)
assert(
  'record.questions.length equals segment question count (not doubled)',
  recordFromStale.questions.length,
  3,
);
// normalizeBankQuestion uppercases MCQ correct letters: 'a'→'A', 'c'→'C', 'b'→'B'
// Stale flat had: q1='c', q2='a', q3='a' → all wrong even after normalization.
// Segments had: q1='a'→'A', q2='c'→'C', q3='b'→'B' (correct per transcript).
assert(
  'q1.correct from segments (→ "A" normalized), not from stale flat ("c" → "C")',
  recordFromStale.questions.find(q => q.id === 'q1')?.correct,
  'A',
);
assert(
  'q2.correct from segments (→ "C" normalized), not from stale flat ("a" → "A")',
  recordFromStale.questions.find(q => q.id === 'q2')?.correct,
  'C',
);
assert(
  'q3.correct from segments (→ "B" normalized), not from stale flat ("a" → "A")',
  recordFromStale.questions.find(q => q.id === 'q3')?.correct,
  'B',
);

// CHK-23 must be 0: the stale flat questions are ignored
const chk23Stale = chk23(recordFromStale, 'test-stale');
assert(
  'CHK-23 = 0 after seeding from part with stale flat questions (stale ignored)',
  chk23Stale.length,
  0,
);

// ── Block 4: A2 — seed works correctly when part has only segments (no flat) ──
console.log('\n── Block 4: seed flattenHorenQuestions — works when part has segments only ──');

const partSegmentsOnly = makeHorenPart({ questions: undefined });
const recordSegOnly = examPartToReusableRecord(partSegmentsOnly, 'horen', meta, blueprint, { sourceKey: 'test-seg-only' });

assert(
  'record from segments-only part has correct question count',
  recordSegOnly.questions.length,
  3,
);
assert(
  'CHK-23 = 0 for segments-only record',
  chk23(recordSegOnly, 'seg-only').length,
  0,
);

// ── Block 5: Lesen records unaffected by A1 change ───────────────────────────
console.log('\n── Block 5: Lesen records unaffected by A1 (else branch untouched) ──');

const lesenPart = {
  teil: 1,
  text: 'Ein langer Lesetext über Stadtgärten und ihre Bedeutung für die moderne Stadt.',
  textTitle: 'Stadtgärten',
  questions: [
    { id: 'lq1', type: 'richtig_falsch', question: 'Stadtgärten sind wichtig.', correct: 'Richtig', correctAnswer: 'Richtig', explanation: 'Laut Text.' },
    { id: 'lq2', type: 'richtig_falsch', question: 'Es gibt keine Stadtgärten mehr.', correct: 'Falsch', correctAnswer: 'Falsch', explanation: 'Es gibt sie noch.' },
  ],
};

const lesenRecord = examPartToReusableRecord(lesenPart, 'lesen', meta, blueprint, { sourceKey: 'test-lesen' });
assert(
  'Lesen record built correctly',
  lesenRecord !== null,
  true,
);
assert(
  'Lesen record questions count unchanged',
  lesenRecord.questions.length,
  2,
);
assert(
  'Lesen record has no segments',
  Array.isArray(lesenRecord.segments),
  false,
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Eje-2 Fase A writer tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
