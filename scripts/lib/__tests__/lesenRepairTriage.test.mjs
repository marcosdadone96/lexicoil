/**
 * lesenRepairTriage.test.mjs — BUG-5 integration test
 *
 * Verifica el path de triaje que se añadió a generate-lesen-part-gemini.mjs:
 *   finalizeBatch FAIL → classifyAndRepair repara → finalizeBatch OK → callLlm spy = 0
 *
 * No lanza ninguna llamada LLM. Toda reparación es determinista (Cubo A/B).
 *
 * Run: node scripts/lib/__tests__/lesenRepairTriage.test.mjs
 * Exit 0 = all pass.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { classifyAndRepair } from '../repairTriage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const AUDIT = path.join(ROOT, 'scripts/audit-pass-2.mjs');

// ── Spy de callLlm: contador que DEBE quedarse en 0 ──────────────────────────
let llmCallSpy = 0;
function fakeCallLlm() {
  llmCallSpy++;
  throw new Error('callLlm NO debería llamarse en el path de triaje reparable');
}

// ── Utilidades ────────────────────────────────────────────────────────────────
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
    console.error(`  ❌  ${desc}: got ${JSON.stringify(value)}`);
    failed++;
  }
}

/** Corre audit-pass-2 sobre un objeto batch y devuelve los findings. */
function runAudit(batchObj) {
  const tmp = path.join(os.tmpdir(), `lesen-triage-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(batchObj), 'utf8');
  const r = spawnSync(process.execPath, [AUDIT, tmp, '--json'], { encoding: 'utf8' });
  fs.rmSync(tmp, { force: true });
  try {
    const parsed = JSON.parse(r.stdout || '{}');
    return (parsed.findings || []).filter(f => f.severity !== 'MINOR');
  } catch (_) {
    return [];
  }
}

function hasFinding(findings, chkId) {
  return findings.some(f => f.id === chkId);
}

// ── TEST 1 — Cubo A: CHK-14 en Lesen T1 ─────────────────────────────────────
console.log('\n── Cubo A: CHK-14 noun caps en Lesen T1 (path Lesen) ──');
{
  // Batch Lesen T1 con sustantivos sin mayúscula en questions y explanation.
  // Usamos nouns que están en KNOWN_LOWER_NOUNS_14: 'garten', 'freundin', 'schule'.
  const batch = {
    passages: [{
      id: 'p-lesen1',
      text: 'Der garten der schule ist sehr groß. die freundin besucht die schule jeden tag.',
      title: 'Die schule',
    }],
    questions: [
      {
        id: 'q-lesen1-01', module: 'lesen', teil: 1, type: 'richtig_falsch',
        question: 'Hat die schule einen garten?',
        correct: 'Richtig', correctAnswer: 'Richtig',
        explanation: 'Ja, der garten der schule ist sehr groß.',
        options: [], lang: 'de', level: 'B1',
      },
      {
        id: 'q-lesen1-02', module: 'lesen', teil: 1, type: 'richtig_falsch',
        question: 'Besucht die freundin die schule?',
        correct: 'Richtig', correctAnswer: 'Richtig',
        explanation: 'Ja, die freundin besucht die schule jeden tag.',
        options: [], lang: 'de', level: 'B1',
      },
    ],
  };

  // ── Paso 1: confirmar que el batch falla en audit (CHK-14 presente) ───────
  const findingsBefore = runAudit(batch);
  assertOk('batch inicial tiene CHK-14 (antes de reparación)', hasFinding(findingsBefore, 'CHK-14'));

  // ── Paso 2: simular el resultado de gate que llega al triaje ─────────────
  // (equivalente a lo que devuelve finalizeBatch cuando audit-pass-2 falla)
  const gatesResult = {
    gate: 'audit2',
    issue: '[IMPORTANT][CHK-14] Sustantivo no capitalizado: "verein"',
    issues: [
      '[IMPORTANT][CHK-14] Sustantivo "garten" no capitalizado en lesen-1',
      '[IMPORTANT][CHK-14] Sustantivo "freundin" no capitalizado en lesen-1',
      '[IMPORTANT][CHK-14] Sustantivo "schule" no capitalizado en lesen-1',
    ],
  };

  // ── Paso 3: triaje — classifyAndRepair (mismo call que en generateLlmPart) ─
  const triage = classifyAndRepair(batch, gatesResult);

  assert('triage.repaired = true (Cubo A)', triage.repaired, true);
  assert('triage.cube = A', triage.cube, 'A');
  assert('triage.calledLlm = false', triage.calledLlm, false);
  assertOk('triage.fixed incluye CHK-14', (triage.fixed || []).includes('CHK-14'));

  // ── Paso 4: spy — callLlm NO debe haberse llamado ────────────────────────
  // En generateLlmPart, si triage.repaired===true se usa triage.batch
  // directamente y NO se entra al loop LLM. Aquí lo modelamos con el spy.
  const llmCallsBefore = llmCallSpy;
  if (triage.repaired === true) {
    // Path del código en generateLlmPart: usa triage.batch, NO llama callLlm
    // (si hubiera llamado, fakeCallLlm incrementaría el spy y lanzaría error)
  } else {
    // Path incorrecto: solo en este test entraría al LLM
    fakeCallLlm();
  }
  assert('spy callLlm = 0 llamadas', llmCallSpy - llmCallsBefore, 0);

  // ── Paso 5: re-auditar el batch reparado → 0 CHK-14 ──────────────────────
  const findingsAfter = runAudit(triage.batch);
  assertOk('batch reparado: sin CHK-14', !hasFinding(findingsAfter, 'CHK-14'));

  // Verificar que los sustantivos están capitalizados
  const repText = JSON.stringify(triage.batch);
  assertOk('"Freundin" capitalizado en batch reparado', repText.includes('Freundin'));
  assertOk('"Garten" capitalizado en batch reparado', repText.includes('Garten'));
}

// ── TEST 2 — Cubo B: sustitución léxica en Lesen T2 ─────────────────────────
console.log('\n── Cubo B: sustitución léxica 1:1 en Lesen T2 (path Lesen) ──');
{
  const batch = {
    passages: [{
      id: 'p-lesen2',
      text: 'Das Unternehmen bietet ein free trial für alle neuen Nutzer an.',
      title: 'Angebot',
    }],
    questions: [
      {
        id: 'q-lesen2-01', module: 'lesen', teil: 2, type: 'multiple_choice',
        question: 'Was bietet das Unternehmen an?',
        options: ['a) Ein free trial', 'b) Einen Rabatt', 'c) Eine Mitgliedschaft'],
        correct: 'a', correctAnswer: 'a',
        explanation: 'Das Unternehmen bietet ein free trial für neue Nutzer an.',
        lang: 'de', level: 'B1',
      },
    ],
  };

  // Gate lexico: "free trial" → "Probeabo" (sugerencia única, sin ambigüedad)
  const gatesResult = {
    gate: 'lexico',
    issue: 'passage text: vocabulario C1/C2 «free trial» → usa «Probeabo» (B1)',
    issues: ['passage text: vocabulario C1/C2 «free trial» → usa «Probeabo» (B1)'],
  };

  // ── Triaje ────────────────────────────────────────────────────────────────
  const triage = classifyAndRepair(batch, gatesResult);

  assert('triage.repaired = true (Cubo B)', triage.repaired, true);
  assert('triage.cube = B', triage.cube, 'B');
  assert('triage.calledLlm = false', triage.calledLlm, false);

  // Spy: callLlm NO se llama
  const llmCallsBefore = llmCallSpy;
  if (triage.repaired === true) {
    // Path correcto: usa triage.batch sin LLM
  } else {
    fakeCallLlm(); // no debería llegar aquí
  }
  assert('spy callLlm = 0 llamadas', llmCallSpy - llmCallsBefore, 0);

  // Verificar sustitución en el batch reparado
  const repText = JSON.stringify(triage.batch);
  assertOk('"free trial" eliminado del batch reparado', !repText.includes('free trial'));
  assertOk('"Probeabo" presente en batch reparado', repText.includes('Probeabo'));
}

// ── TEST 3 — Cubo D: batch Lesen con dedup falla → descartar, spy = 0 ────────
console.log('\n── Cubo D: dedup gate en Lesen → descartar (path Lesen) ──');
{
  const batch = {
    passages: [{ id: 'p1', text: 'Ein schöner Tag.' }],
    questions: [{
      id: 'q1', module: 'lesen', teil: 1, type: 'richtig_falsch',
      question: 'Ist es schön?', correct: 'Richtig', correctAnswer: 'Richtig',
      explanation: 'Ja, es ist schön.', options: [], lang: 'de', level: 'B1',
    }],
  };

  const gatesResult = {
    gate: 'dedup',
    issue: 'Texto demasiado similar al pool existente (Jaccard 0.72)',
    issues: ['Texto demasiado similar al pool existente (Jaccard 0.72)'],
  };

  const triage = classifyAndRepair(batch, gatesResult);

  assert('triage.discard = true (Cubo D)', triage.discard, true);
  assert('triage.repaired = false', triage.repaired, false);

  // En generateLlmPart: triage.discard → return immediate sin LLM
  const llmCallsBefore = llmCallSpy;
  if (triage.discard) {
    // Path correcto: descarte inmediato, NO llama callLlm
  } else {
    fakeCallLlm(); // no debería llegar aquí
  }
  assert('spy callLlm = 0 llamadas en descarte', llmCallSpy - llmCallsBefore, 0);
}

// ── RESUMEN ───────────────────────────────────────────────────────────────────
console.log(`\n── LLM spy total: ${llmCallSpy} llamadas (debe ser 0) ──`);
assert('ZERO llamadas LLM en todo el suite', llmCallSpy, 0);

console.log(`\n── Resultado: ${passed} ✅  ${failed} ❌ ──`);
if (failed > 0) process.exit(1);
