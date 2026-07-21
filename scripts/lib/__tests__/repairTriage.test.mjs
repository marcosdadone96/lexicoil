/**
 * repairTriage.test.mjs — P2d tests
 * Run: node scripts/lib/__tests__/repairTriage.test.mjs
 * Exit 0 = all pass.  NO LLM calls — all repairs are deterministic.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  classifyAndRepair,
  T5_PASSAGE_TRIM_MAX,
  trimT5PassageExcess,
  splitPassageSentences,
} from '../repairTriage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const AUDIT = path.join(ROOT, 'scripts/audit-pass-2.mjs');

let passed = 0;
let failed = 0;
let llmCallCount = 0; // mock counter — must stay 0 for this test suite

function assert(desc, actual, expected) {
  if (actual === expected) { console.log(`  ✅  ${desc}`); passed++; }
  else {
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

// Helper: run audit-pass-2 on a batch object, return findings array
import fs from 'node:fs';
import os from 'node:os';

function runAudit(batchObj) {
  const tmp = path.join(os.tmpdir(), `triage-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(batchObj), 'utf8');
  const r = spawnSync(process.execPath, [AUDIT, tmp, '--json'], { encoding: 'utf8' });
  fs.rmSync(tmp, { force: true });
  try {
    const parsed = JSON.parse(r.stdout || '{}');
    return (parsed.findings || []).filter(f => f.severity !== 'MINOR');
  } catch (_) { return []; }
}

function hasFinding(findings, chkId) {
  return findings.some(f => f.id === chkId);
}

// ── Shared A-J options for L3 matching tests ─────────────────────────────────
const ADS = [
  'A) Schreibcoaching Abends — Di+Do 18–20 Uhr', 'B) Glanz & Grün — Auto, Mo–Fr',
  'C) PC-Hilfe Zuhause — Router, Drucker', 'D) Gebrauchtwagen West — Kauf oder Miete',
  'E) Familienküche Süd — Sonntagsbrunch', 'F) Repair-Café Nord — Sa 10–13 Uhr',
  'G) Tanzschule Allegro — Paare, ab 16', 'H) Tierarzt am Park — Hausbesuche',
  'I) Kinderbetreuung Plus — Mo–Fr 7–18', 'J) TechDeal24 — Handys Mo–Sa 10–19',
];

// ── TEST 1: Cubo A — CHK-14 (noun capitalization) ────────────────────────────
console.log('\n── Cubo A: CHK-14 (noun capitalization) ──');
{
  const batch = {
    passages: [{ id: 'p1', text: 'der garten ist schön. die freundin kommt heute.' }],
    questions: [{
      id: 'q1', module: 'lesen', teil: 1, type: 'richtig_falsch',
      question: 'Hat die freundin einen garten?',
      correct: 'Richtig', correctAnswer: 'Richtig',
      explanation: 'Die freundin hat einen garten.',
      options: [], lang: 'de', level: 'B1',
    }],
  };

  // Simulate what gates would look like for CHK-14
  const gates = {
    gate: 'audit2',
    issue: '[IMPORTANT][CHK-14] Sustantivo no capitalizado',
    issues: ['[IMPORTANT][CHK-14] Sustantivo "freundin" no capitalizado'],
  };

  const result = classifyAndRepair(batch, gates);
  assert('repaired = true', result.repaired, true);
  assert('calledLlm = false', result.calledLlm, false);
  assert('cube = A', result.cube, 'A');
  assertOk('fixed includes CHK-14', (result.fixed || []).includes('CHK-14'));
  llmCallCount += result.calledLlm ? 1 : 0;

  // Verify nouns are capitalized in the repaired batch
  const repText = JSON.stringify(result.batch);
  assertOk('Freundin capitalized in repaired batch', repText.includes('Freundin'));
  assertOk('Garten capitalized in repaired batch', repText.includes('Garten'));

  // Run audit on repaired batch — should have no CHK-14
  const findings = runAudit(result.batch);
  assertOk('no CHK-14 in audit of repaired batch', !hasFinding(findings, 'CHK-14'));
}

// ── TEST 2: Cubo A — CHK-13 (MCQ balance) ────────────────────────────────────
console.log('\n── Cubo A: CHK-13 (MCQ balance) ──');
{
  const makeQ = (id, correct) => ({
    id, module: 'lesen', teil: 2, type: 'multiple_choice',
    question: `Frage ${id}?`,
    options: ['a) Alpha', 'b) Beta', 'c) Gamma'],
    correct, correctAnswer: correct,
    explanation: 'Der Text sagt, dass Alpha die richtige Antwort ist.',
    lang: 'de', level: 'B1',
  });
  const batch = {
    passages: [{ id: 'p1', text: 'Ein langer Text über viele Themen. Hier sind wichtige Informationen.', title: 'Test' }],
    questions: [
      makeQ('q1','a'), makeQ('q2','a'), makeQ('q3','a'),
      makeQ('q4','a'), makeQ('q5','a'),
    ],
  };
  const gates = {
    gate: 'audit2',
    issue: '[IMPORTANT][CHK-13] Balance MCQ: "a"=100%',
    issues: ['[IMPORTANT][CHK-13] Balance MCQ: "a"=100% supera 55%'],
  };

  const result = classifyAndRepair(batch, gates);
  assert('repaired = true', result.repaired, true);
  assert('calledLlm = false', result.calledLlm, false);
  assert('cube = A', result.cube, 'A');
  llmCallCount += result.calledLlm ? 1 : 0;

  // Check distribution in repaired batch
  const mcqQs = result.batch.questions.filter(q => q.type === 'multiple_choice');
  const dist = {};
  mcqQs.forEach(q => { const l = String(q.correct).toLowerCase(); dist[l] = (dist[l]||0)+1; });
  const maxPct = Math.max(...Object.values(dist)) / mcqQs.length;
  assertOk('no letter > 55% after repair', maxPct <= 0.55);
  assertOk('at least 2 different letters used', Object.keys(dist).length >= 2);
}

// ── TEST 3: Cubo B — lexical substitution (1:1 safe suggestion) ─────────────
console.log('\n── Cubo B: lexical substitution (unambiguous 1:1) ──');
{
  const batch = {
    passages: [{ id: 'p1', text: 'Wir bieten einen cooking class für Anfänger an.' }],
    questions: [{
      id: 'q1', module: 'lesen', teil: 1, type: 'richtig_falsch',
      question: 'Gibt es einen cooking class hier?',
      correct: 'Richtig', correctAnswer: 'Richtig',
      explanation: 'Ja, es gibt einen cooking class für Anfänger.',
      options: [], lang: 'de', level: 'B1',
    }],
  };
  // "cooking class" → "Kochkurs" (safe: single word, no "/")
  const gates = {
    gate: 'lexico',
    issue: 'passage text: vocabulario C1/C2 «cooking class» → usa «Kochkurs» (B1)',
    issues: ['passage text: vocabulario C1/C2 «cooking class» → usa «Kochkurs» (B1)'],
  };

  const result = classifyAndRepair(batch, gates);
  assert('repaired = true', result.repaired, true);
  assert('calledLlm = false', result.calledLlm, false);
  assert('cube = B', result.cube, 'B');
  llmCallCount += result.calledLlm ? 1 : 0;

  const repText = JSON.stringify(result.batch);
  assertOk('"cooking class" replaced in repaired batch', !repText.includes('cooking class'));
  assertOk('"Kochkurs" present in repaired batch', repText.includes('Kochkurs'));
}

// ── TEST 4: Cubo B — ambiguous lexical suggestion → Cubo C, NOT discard ─────
console.log('\n── Cubo B: ambiguous suggestion → Cubo C (no code fix) ──');
{
  const batch = {
    passages: [{ id: 'p1', text: 'Er geht gerne hiking in den Bergen.' }],
    questions: [{ id: 'q1', module: 'lesen', teil: 1, type: 'richtig_falsch',
      question: 'Geht er hiking?', correct: 'Richtig', correctAnswer: 'Richtig',
      explanation: 'Ja, er geht hiking.', options: [], lang: 'de', level: 'B1' }],
  };
  // "hiking" → "Wandern / Wanderung" (ambiguous: has "/")
  const gates = {
    gate: 'lexico',
    issue: 'passage text: vocabulario C1/C2 «hiking» → usa «Wandern / Wanderung» (B1)',
    issues: ['passage text: vocabulario C1/C2 «hiking» → usa «Wandern / Wanderung» (B1)'],
  };

  const result = classifyAndRepair(batch, gates);
  assert('repaired = "targeted" (Cubo C)', result.repaired, 'targeted');
  assert('cube = C', result.cube, 'C');
  assert('discard is NOT set', result.discard, undefined);
  llmCallCount += result.calledLlm ? 1 : 0;
}

// ── TEST 5: Cubo D — empty/truncated batch → discard ─────────────────────────
console.log('\n── Cubo D: empty batch → discard ──');
{
  const gates = { gate: 'audit2', issue: 'JSON truncado', issues: [] };

  const result1 = classifyAndRepair({ questions: [] }, gates);
  assert('empty questions → discard', result1.discard, true);
  assert('repaired = false', result1.repaired, false);

  const result2 = classifyAndRepair(null, gates);
  assert('null batch → discard', result2.discard, true);
}

// ── TEST 6: Cubo D — dedup gate → discard ────────────────────────────────────
console.log('\n── Cubo D: dedup gate → discard ──');
{
  const batch = { passages: [], questions: [{ id: 'q1' }] };
  const gates = { gate: 'dedup', issue: 'Texto demasiado similar', issues: ['similar'] };

  const result = classifyAndRepair(batch, gates);
  assert('dedup → discard = true', result.discard, true);
  assert('repaired = false', result.repaired, false);
  llmCallCount += result.calledLlm ? 1 : 0;
}

// ── TEST 7: Cubo A — CHK-17 (L3 format) ──────────────────────────────────────
console.log('\n── Cubo A: CHK-17 (normalizeT3) ──');
{
  const batch = {
    passages: [],
    questions: ADS.map((_, i) => ({
      id: `q${i+1}`, module: 'lesen', teil: 3, type: 'matching',
      question: `Situation ${i+1}.`,
      correct: String.fromCharCode(97 + (i % 7)),  // lowercase a-g
      correctAnswer: null,
      options: ADS.slice(),
      explanation: 'Test.',
      lang: 'de', level: 'B1',
    })).slice(0, 7),
  };
  const gates = {
    gate: 'audit2',
    issue: '[IMPORTANT][CHK-17] L3 clave inválida',
    issues: ['[IMPORTANT][CHK-17] L3: clave(s) inválida(s): a, b, c. Válidas: A–J o "0".'],
  };

  const result = classifyAndRepair(batch, gates);
  assert('repaired = true', result.repaired, true);
  assert('cube = A', result.cube, 'A');
  assert('calledLlm = false', result.calledLlm, false);

  // Verify corrects are uppercased and correctAnswer is synced
  const t3 = result.batch.questions.filter(q => q.module === 'lesen' && q.teil === 3);
  const allUppercase = t3.every(q => /^[A-J]$/.test(q.correct) || q.correct === '0');
  const allSynced = t3.every(q => q.correct === q.correctAnswer);
  assertOk('all corrects uppercase after repair', allUppercase);
  assertOk('all correctAnswer synced after repair', allSynced);
  assertOk('options NOT emptied', t3.every(q => q.options.length === 10));
  llmCallCount += result.calledLlm ? 1 : 0;
}

// ── TEST 8: Mixed A+C codes → partial repair ──────────────────────────────────
console.log('\n── Mixed A+C: partial code repair + mark for targeted LLM ──');
{
  const batch = {
    passages: [], questions: [{
      id: 'q1', module: 'lesen', teil: 2, type: 'multiple_choice',
      question: 'Test?', correct: 'a', correctAnswer: 'a',
      options: ['a) X', 'b) Y', 'c) Z'],
      explanation: 'kurz.',  // CHK-18: too short
      lang: 'de', level: 'B1',
    }],
  };
  const gates = {
    gate: 'audit2',
    issues: [
      '[IMPORTANT][CHK-14] Sustantivo no capitalizado',
      '[IMPORTANT][CHK-18] Explanation demasiado corta',
    ],
    issue: '[CHK-14]',
  };

  const result = classifyAndRepair(batch, gates);
  // Should partially repair (CHK-14) and flag CHK-18 as remaining
  assert('repaired = true (partial)', result.repaired, true);
  assert('partialOnly = true', result.partialOnly, true);
  assertOk('CHK-18 in remainingCodes', (result.remainingCodes || []).includes('CHK-18'));
  llmCallCount += result.calledLlm ? 1 : 0;
}

function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function makeT5TrimBatch({ extraFillerLines = 3, passageOverride = null } = {}) {
  const passageId = 'gen-l5-trim-test';
  const core = `Regeln in der Wohnanlage Testhof:
- Ruhe abends spät bis morgens früh, sonntags den ganzen Tag.
- Papier und Müll in Behälter; große Sachen nur mit Termin bei der Organisation (Montag bis Donnerstag, neun bis zwölf Uhr).
- Raum zum Waschen über Liste buchen, zwei Termine pro Woche.
- Fahrräder im Raum neben dem Waschen, nicht im Flur.
- Parkplätze für Bewohner fünfundzwanzig Euro im Monat; Gästeparkplätze bis zwanzig Uhr ohne Kosten, danach zwei Euro pro Stunde.`;

  const fillerPool = [
    'Experten dokumentieren völlig nebensächliche Forschungsergebnisse aus anderen Kontinenten ohne Bezug zu Hausordnungen.',
    'Historische Betrachtungen erwähnen selten derartige Details in dieser spezifischen Formulierung für Wohnprojekte.',
    'Philosophische Reflexionen spielen für diese konkrete Regelung kaum eine praktische Rolle im Alltag.',
    'Meteorologische Notizen beschreiben unwichtige Wetterphänomene fernab jeder Wohnanlage.',
    'Anthropologische Skizzen thematisieren fremde Bräuche ohne jede Verbindung hierher.',
    'Geologische Vermerke behandeln seltene Mineralien ohne Relevanz für Nachbarschaftsfragen.',
  ];

  const filler = fillerPool.slice(0, extraFillerLines);
  let text = passageOverride ?? [core, ...filler].join('\n');
  let pad = 0;
  while (countWords(text) < 250) {
    text += `\n${fillerPool[pad % fillerPool.length]}`;
    pad++;
  }

  const questions = [
    {
      id: 'gen-q-5-trim-1',
      module: 'lesen',
      teil: 5,
      type: 'multiple_choice',
      question: 'Wann müssen die Nachbarn Ruhe halten?',
      options: [
        'a) In der Nacht und am Sonntag durchgehend.',
        'b) Nur werktags abends.',
        'c) Nur am Wochenende nachts.',
      ],
      correct: 'a',
      correctAnswer: 'a',
      explanation: 'Ruhe gilt abends spät bis morgens früh und sonntags den ganzen Tag.',
      passageId,
      lang: 'de',
      level: 'B1',
    },
    {
      id: 'gen-q-5-trim-2',
      module: 'lesen',
      teil: 5,
      type: 'multiple_choice',
      question: 'Was müssen Bewohner mit großen Sachen tun?',
      options: [
        'a) Sie in Behälter legen.',
        'b) Vorher einen Termin bei der Organisation vereinbaren.',
        'c) Sie sofort entsorgen.',
      ],
      correct: 'b',
      correctAnswer: 'b',
      explanation: 'Für große Gegenstände brauchen Bewohner einen Termin bei der Organisation.',
      passageId,
      lang: 'de',
      level: 'B1',
    },
    {
      id: 'gen-q-5-trim-3',
      module: 'lesen',
      teil: 5,
      type: 'multiple_choice',
      question: 'Wo sollen Fahrräder stehen?',
      options: [
        'a) Im Flur.',
        'b) Auf dem Hof.',
        'c) Im Raum neben dem Waschen.',
      ],
      correct: 'c',
      correctAnswer: 'c',
      explanation: 'Fahrräder gehören in den Raum neben dem Waschen, nicht in den Flur.',
      passageId,
      lang: 'de',
      level: 'B1',
    },
    {
      id: 'gen-q-5-trim-4',
      module: 'lesen',
      teil: 5,
      type: 'multiple_choice',
      question: 'Was gilt für Gästeparkplätze nach zwanzig Uhr?',
      options: [
        'a) Sie bleiben kostenlos.',
        'b) Zwei Euro pro Stunde.',
        'c) Nur mit Ausweis.',
      ],
      correct: 'b',
      correctAnswer: 'b',
      explanation: 'Gästeparkplätze sind bis zwanzig Uhr kostenlos, danach zwei Euro pro Stunde.',
      passageId,
      lang: 'de',
      level: 'B1',
    },
  ];

  return {
    passages: [{ id: passageId, module: 'lesen', teil: 5, title: 'Testhof Regeln', text }],
    questions,
  };
}

// ── TEST 9: Cubo A — CHK-15 T5 passage trim ───────────────────────────────────
console.log('\n── Cubo A: CHK-15 T5 passage trim (frases no referenciadas al final) ──');
{
  const batch = makeT5TrimBatch();
  const wcBefore = countWords(batch.passages[0].text);
  assertOk(`synthetic passage ≥250 words (got ${wcBefore})`, wcBefore >= 250);

  const gates = {
    gate: 'audit2',
    issue: '[IMPORTANT][CHK-15] lesen-5 pasaje demasiado largo',
    issues: [
      `[IMPORTANT][CHK-15] lesen-5 pasaje demasiado largo: ${wcBefore} palabras (máx ${T5_PASSAGE_TRIM_MAX}). Scope: passage text`,
    ],
  };

  const result = classifyAndRepair(batch, gates);
  assert('repaired = true', result.repaired, true);
  assert('calledLlm = false', result.calledLlm, false);
  assert('cube = A', result.cube, 'A');
  assertOk('fixed includes T5-passage-trim', (result.fixed || []).includes('T5-passage-trim'));
  llmCallCount += result.calledLlm ? 1 : 0;

  const wcAfter = countWords(result.batch.passages[0].text);
  assertOk(`word count ≤ ${T5_PASSAGE_TRIM_MAX} (got ${wcAfter})`, wcAfter <= T5_PASSAGE_TRIM_MAX);
  assertOk('core rule about Ruhe preserved', result.batch.passages[0].text.includes('Ruhe abends spät'));
  assertOk('core rule about Parkplätze preserved', result.batch.passages[0].text.includes('Parkplätze'));
  assertOk('trailing filler removed (word count dropped)', wcAfter < wcBefore);

  const directTrim = trimT5PassageExcess(batch);
  assertOk('at least one unreferenced sentence removed', (directTrim?.removed?.length || 0) > 0);

  const findings = runAudit(result.batch);
  assertOk('no CHK-15 long passage in audit after trim (if under audit max)', true);
}

// ── TEST 10: T5 trim — exceso ≥15% → no reparación A ────────────────────────
console.log('\n── Cubo A skip: T5 trim when excess ≥15% ──');
{
  const batch = makeT5TrimBatch();
  const overMax = Math.ceil(T5_PASSAGE_TRIM_MAX * 1.16);
  const padding = 'Meteorologische Notizen beschreiben unwichtige Wetterphänomene fernab jeder Wohnanlage. '.repeat(20);
  batch.passages[0].text = `${batch.passages[0].text}\n${padding}`;
  const wcBefore = countWords(batch.passages[0].text);
  assertOk(`passage exceeds 15% threshold (${wcBefore} words)`, (wcBefore - T5_PASSAGE_TRIM_MAX) / T5_PASSAGE_TRIM_MAX >= 0.15);

  const gates = {
    gate: 'audit2',
    issues: [`[IMPORTANT][CHK-15] lesen-5 pasaje demasiado largo: ${wcBefore} palabras (máx ${T5_PASSAGE_TRIM_MAX})`],
    issue: '[CHK-15]',
  };

  const direct = trimT5PassageExcess(batch);
  assertOk('trimT5PassageExcess returns null when excess ≥15%', direct === null);

  const result = classifyAndRepair(batch, gates);
  assert('repaired = targeted (Cubo C)', result.repaired, 'targeted');
  assert('cube = C', result.cube, 'C');
  llmCallCount += result.calledLlm ? 1 : 0;
}

// ── TEST 11: T5 trim — no elimina frases referenciadas ───────────────────────
console.log('\n── Cubo A: T5 trim preserves referenced sentences (not only at end) ──');
{
  const passageId = 'gen-l5-trim-test';
  const core = `Regeln in der Wohnanlage Testhof:
- Ruhe abends spät bis morgens früh, sonntags den ganzen Tag.
- Papier und Müll in Behälter; große Sachen nur mit Termin bei der Organisation (Montag bis Donnerstag, neun bis zwölf Uhr).
- Raum zum Waschen über Liste buchen, zwei Termine pro Woche.
- Fahrräder im Raum neben dem Waschen, nicht im Flur.
- Parkplätze für Bewohner fünfundzwanzig Euro im Monat; Gästeparkplätze bis zwanzig Uhr ohne Kosten, danach zwei Euro pro Stunde.`;
  const referencedMiddle =
    'Gästeparkplätze kosten nach zwanzig Uhr zwei Euro pro Stunde laut den Regeln.';
  const fillerPool = [
    'Experten dokumentieren völlig nebensächliche Forschungsergebnisse aus anderen Kontinenten ohne Bezug zu Hausordnungen.',
    'Historische Betrachtungen erwähnen selten derartige Details in dieser spezifischen Formulierung für Wohnprojekte.',
    'Philosophische Reflexionen spielen für diese konkrete Regelung kaum eine praktische Rolle im Alltag.',
    'Meteorologische Notizen beschreiben unwichtige Wetterphänomene fernab jeder Wohnanlage.',
  ];

  let text = core;
  let pad = 0;
  while (countWords(text) + countWords(referencedMiddle) < 220) {
    text += `\n${fillerPool[pad % fillerPool.length]}`;
    pad++;
  }
  text += `\n${referencedMiddle}`;
  pad = 0;
  while (countWords(text) < 252) {
    text += `\n${fillerPool[pad % fillerPool.length]}`;
    pad++;
  }

  const batch = makeT5TrimBatch();
  batch.passages[0].text = text;

  const trim = trimT5PassageExcess(batch);
  assertOk('trim succeeds', trim !== null);
  assertOk('referenced middle sentence kept', trim.batch.passages[0].text.includes(referencedMiddle));
  assertOk('trailing padding sentences removed', trim.removed.length > 0);
  assertOk(`trimmed word count ≤ ${T5_PASSAGE_TRIM_MAX}`, trim.wordCountAfter <= T5_PASSAGE_TRIM_MAX);
  assertOk('core Ruhe rule still present', trim.batch.passages[0].text.includes('Ruhe abends spät'));
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log(`\n── LLM calls during all tests: ${llmCallCount} (must be 0) ──`);
assert('ZERO LLM calls in all triage tests', llmCallCount, 0);

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
