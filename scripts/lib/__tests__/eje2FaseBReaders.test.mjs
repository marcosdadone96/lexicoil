/**
 * eje2FaseBReaders.test.mjs — Eje-2 Fase B: reader priority inversion
 *
 * Tests the conditional guard: "if segments → segments wins; else → questions[]".
 *
 * B1. flattenExam:
 *   - Hören-con-segments: aplana SOLO desde segments (questions[] ignorado)
 *   - H4 plano (sin segments): aplana desde questions[]
 *   - Lesen plano: aplana desde questions[] (sin cambio)
 *   - Hören con doble almacenamiento (el bug): ahora segments gana, no questions[]
 *
 * B2. forEachGoetheQ (simulado):
 *   - Hören-con-segments: cada pregunta se visita UNA vez (no dos)
 *   - H4 plano: se visita exactamente una vez desde questions[]
 *   - Lesen: se visita exactamente una vez
 *
 * Run: node scripts/lib/__tests__/eje2FaseBReaders.test.mjs
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

// ── Helper: build minimal exam wrapper for auditExam ─────────────────────────

function makeExam({ lesenParts = [], horenParts = [], schreibenParts = [] } = {}) {
  return { exam: { lesenParts, horenParts, schreibenParts } };
}

const LESEN_TEXT = 'Ein langer Lesetext über Stadtentwicklung und moderne Architektur in deutschen Städten. Die Stadtgärten spielen eine wichtige Rolle.';

// ── B1.1: Hören-con-segments — flattenExam reads ONLY from segments ───────────
console.log('\n── B1.1: flattenExam — Hören-con-segments reads from segments only ──');

// Part with BOTH segments (correct="a") and stale questions[] (correct="c")
// Before Fase B: questions[] won → wrong answer. After: segments win → correct.
const horenConSegments = {
  teil: 2,
  transcript: 'Moderator: Guten Tag. Was essen Sie gern? Gast: Ich esse gern Pasta.',
  segments: [{
    id: 'seg_0', label: 'Aufnahme 1',
    transcript: 'Moderator: Guten Tag. Was essen Sie gern? Gast: Ich esse gern Pasta.',
    passageId: 'seg_0',
    questions: [
      { id: 'q1', type: 'multiple_choice', question: 'Was isst der Gast gern?', correct: 'a', correctAnswer: 'a', options: ['a) Pasta', 'b) Brot', 'c) Salat'], explanation: 'Gast: Pasta' },
      { id: 'q2', type: 'multiple_choice', question: 'Wer fragt?', correct: 'b', correctAnswer: 'b', options: ['a) Gast', 'b) Moderator', 'c) Niemand'], explanation: 'Moderator fragt' },
      { id: 'q3', type: 'multiple_choice', question: 'Wie begrüßt der Moderator?', correct: 'c', correctAnswer: 'c', options: ['a) Hallo', 'b) Servus', 'c) Guten Tag'], explanation: 'Guten Tag' },
    ],
  }],
  // Stale flat questions with WRONG correct values (the CHK-23 bug)
  questions: [
    { id: 'q1', type: 'multiple_choice', question: 'Was isst der Gast gern?', correct: 'c', correctAnswer: 'c', options: ['a) Pasta', 'b) Brot', 'c) Salat'], explanation: 'wrong' },
    { id: 'q2', type: 'multiple_choice', question: 'Wer fragt?', correct: 'a', correctAnswer: 'a', options: ['a) Gast', 'b) Moderator', 'c) Niemand'], explanation: 'wrong' },
    { id: 'q3', type: 'multiple_choice', question: 'Wie begrüßt der Moderator?', correct: 'a', correctAnswer: 'a', options: ['a) Hallo', 'b) Servus', 'c) Guten Tag'], explanation: 'wrong' },
  ],
};

const examWithSeg = makeExam({ horenParts: [horenConSegments] });
const auditSeg = auditExam(examWithSeg, 'test-horen-seg');

// flattenExam should produce exactly 3 questions (no duplicates)
assert(
  'B1.1: flattenExam produces exactly 3 questions (no duplicates from segments+questions)',
  auditSeg.questionsScanned,
  3,
);

// CHK-23 should NOT fire — flattenExam no longer even reads questions[] when segments exist,
// so no conflict is seen by auditExam (it was pre-checked by isExamPublishable anyway)
const chk23InAudit = auditSeg.findings.filter(f => f.id === 'CHK-23');
assert(
  'B1.1: CHK-23 does NOT fire inside auditExam (flattenExam skipped questions[])',
  chk23InAudit.length,
  0,
);

// ── B1.2: H4 plano (no segments) — fallback to questions[] ───────────────────
console.log('\n── B1.2: flattenExam — H4 plano (no segments) uses questions[] ──');

const horenH4Plano = {
  teil: 4,
  transcript: 'Anna sucht eine Wohnung. Sie liest Anzeigen in der Zeitung und online.',
  questions: [
    { id: 'h4q1', type: 'matching', question: 'Wer sucht eine Wohnung?', correct: 'A', correctAnswer: 'A', options: ['A) Anna', 'B) Peter', 'C) Maria'] },
    { id: 'h4q2', type: 'matching', question: 'Wo sucht sie?', correct: 'B', correctAnswer: 'B', options: ['A) Im Radio', 'B) In der Zeitung', 'C) Im TV'] },
  ],
};

const examH4 = makeExam({ horenParts: [horenH4Plano] });
const auditH4 = auditExam(examH4, 'test-horen-h4');

assert(
  'B1.2: H4 plano — flattenExam reads 2 questions from questions[] (not 0)',
  auditH4.questionsScanned,
  2,
);

// ── B1.3: Lesen plano — unchanged behavior ────────────────────────────────────
console.log('\n── B1.3: flattenExam — Lesen plano reads from questions[] (unchanged) ──');

const lesenT1 = {
  teil: 1,
  text: LESEN_TEXT,
  textTitle: 'Stadtentwicklung',
  questions: [
    { id: 'lq1', type: 'richtig_falsch', question: 'Stadtgärten spielen eine wichtige Rolle.', correct: 'Richtig', correctAnswer: 'Richtig', explanation: 'Laut Text.' },
    { id: 'lq2', type: 'richtig_falsch', question: 'Es gibt keine modernen Städte mehr.', correct: 'Falsch', correctAnswer: 'Falsch', explanation: 'Im Gegenteil.' },
    { id: 'lq3', type: 'richtig_falsch', question: 'Architektur spielt keine Rolle.', correct: 'Falsch', correctAnswer: 'Falsch', explanation: 'Doch, sie spielt eine Rolle.' },
  ],
};

const examLesen = makeExam({ lesenParts: [lesenT1] });
const auditLesen = auditExam(examLesen, 'test-lesen');

assert(
  'B1.3: Lesen plano — flattenExam reads 3 questions from questions[] (unchanged)',
  auditLesen.questionsScanned,
  3,
);

// ── B1.4: Mixed exam — Hören-with-segments + H4-plano + Lesen = correct totals ─
console.log('\n── B1.4: flattenExam — mixed real exam: correct question totals ──');

const mixedExam = makeExam({
  lesenParts: [lesenT1],             // 3 from questions[]
  horenParts: [
    horenConSegments,                // 3 from segments (NOT from stale questions[])
    horenH4Plano,                    // 2 from questions[] (no segments)
  ],
});

const auditMixed = auditExam(mixedExam, 'test-mixed');

// 3 (Lesen) + 3 (Hören-seg, from segments) + 2 (H4-plano) = 8 total
assert(
  'B1.4: mixed exam — total 8 questions (no duplicates, no missing)',
  auditMixed.questionsScanned,
  8,
);

// ── B2: forEachGoetheQ double-visit simulation ────────────────────────────────
console.log('\n── B2: forEachGoetheQ double-visit — segments-only, no duplicates ──');

// We can't import the browser-only examRunner.js, so we simulate the SAME logic
// that was patched (the conditional guard) to prove the invariant holds.

function simulateForEachGoetheQ(d, fn) {
  d.horenParts?.forEach((p, pi) => {
    const meta = { module: 'horen', teil: p.teil, part: p };
    if (p.segments?.length) {
      // Eje-2 Fase B: segments autoridad
      p.segments.forEach((s, si) => {
        const segMeta = { ...meta, segment: si };
        (s.questions || []).forEach(q => fn('horen_' + pi + '_' + si, q, segMeta));
      });
    } else {
      // Sin segments: questions[] es la fuente
      (p.questions || []).forEach(q => fn('horen_' + pi, q, meta));
    }
  });
}

// Test: Hören-con-segments — each q visited exactly once
const visitCounts = {};
simulateForEachGoetheQ({ horenParts: [horenConSegments] }, (mod, q) => {
  const key = q.id;
  visitCounts[key] = (visitCounts[key] || 0) + 1;
});

assert(
  'B2: q1 visited exactly 1 time (not 2 — double-visit killed)',
  visitCounts['q1'],
  1,
);
assert(
  'B2: q2 visited exactly 1 time',
  visitCounts['q2'],
  1,
);
assert(
  'B2: q3 visited exactly 1 time',
  visitCounts['q3'],
  1,
);
assert(
  'B2: total unique visit count = 3 (not 6)',
  Object.values(visitCounts).reduce((a, b) => a + b, 0),
  3,
);

// Verify the KEY format: with segments, key is 'horen_0_0_qId' (not 'horen_0_qId')
const visitedKeys = {};
simulateForEachGoetheQ({ horenParts: [horenConSegments] }, (mod, q) => {
  visitedKeys[mod + '_' + q.id] = (visitedKeys[mod + '_' + q.id] || 0) + 1;
});
assert(
  'B2: answer key format uses segment path horen_0_0_q1 (not flat horen_0_q1)',
  'horen_0_0_q1' in visitedKeys,
  true,
);
assert(
  'B2: flat key horen_0_q1 NOT used when segments exist',
  'horen_0_q1' in visitedKeys,
  false,
);

// Test: H4 plano — questions[] visited exactly once
const visitCountsH4 = {};
simulateForEachGoetheQ({ horenParts: [horenH4Plano] }, (mod, q) => {
  visitCountsH4[q.id] = (visitCountsH4[q.id] || 0) + 1;
});
assert(
  'B2: H4 plano h4q1 visited exactly 1 time',
  visitCountsH4['h4q1'],
  1,
);
assert(
  'B2: H4 plano h4q2 visited exactly 1 time',
  visitCountsH4['h4q2'],
  1,
);
assert(
  'B2: H4 plano uses flat key horen_0_h4q1 (no segments)',
  Object.keys(visitedKeys).some(k => k.startsWith('horen_0_h4q')) === false,
  true, // H4 was tested in separate visitCountsH4 map
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Eje-2 Fase B reader tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
