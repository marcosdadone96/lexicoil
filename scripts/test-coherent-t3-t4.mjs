#!/usr/bin/env node
/**
 * test-coherent-t3-t4.mjs — Verifica que el builder produce L3/T4 coherentes
 * y rechaza mezclas ("Frankenstein parts").
 *
 * Tests:
 *  T3-fresh     buildValidatedT3Part() → 7 ítems, misma A-J, pasa checker
 *  T4-fresh     buildValidatedT4Part() → 7 ítems, autores únicos, pasa checker
 *  T3-bank-ok   Banco con 7 ítems del mismo set → assemble elige el set completo
 *  T3-reject    Banco con 7+7 ítems de 2 sets distintos, sin generador → coverage=false
 *  T4-reject    Banco con 4+3 ítems de 2 slugs distintos, sin generador → coverage=false
 *  CHK-21-fire  Examen con 7 ítems T4 que comparten autor → CHK-21 emite IMPORTANT
 *
 * Exit 0 si todos pasan, exit 1 si alguno falla.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildValidatedT3Part } from './make-t3.mjs';
import { buildValidatedT4Part, isCoherentT4Batch } from './make-t4.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load ExamBlueprint (CJS)
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg}`);
    failed++;
  }
}

// ── Minimal blueprint for ExamBlueprint.assemble() ────────────────────────────
function minBlueprintT3() {
  return {
    modules: [{
      id: 'lesen',
      parts: [{
        teil: 3,
        slotType: 'ads_matching',
        questionTypes: ['matching'],
        itemsTotal: 7,
      }],
    }],
  };
}

function minBlueprintT4() {
  return {
    modules: [{
      id: 'lesen',
      parts: [{
        teil: 4,
        slotType: 'forum_opinions',
        questionTypes: ['ja_nein'],
        itemsTotal: 7,
      }],
    }],
  };
}

function minBank(questions) {
  return { meta: { language: 'de', level: 'B1' }, questions, passages: [] };
}

// Build a list of 10 ad options (shared across 7 questions in the same set)
function makeSharedOptions(prefix) {
  const letters = ['A','B','C','D','E','F','G','H','I','J'];
  return letters.map(l => `${l}) ${prefix} Anzeige ${l} langer Text mit mehr als drei Wörtern`);
}

// Build 7 T3 bank items sharing the same options list
function makeT3Set(prefix, idPrefix) {
  const options = makeSharedOptions(prefix);
  const letters = ['A','B','C','D','E','F','G','H','I','J'];
  const corrects = ['A','B','C','D','E','0','F','G'];
  return Array.from({ length: 7 }, (_, i) => ({
    id: `${idPrefix}-q${i+1}`,
    module: 'lesen',
    teil: 3,
    type: 'matching',
    question: `${prefix} Situation ${i+1}: Ich suche etwas für mein Hobby.`,
    options,
    correct: corrects[i],
    correctAnswer: corrects[i],
    explanation: `${prefix} Anzeige passt zur Situation ${i+1}.`,
    lang: 'de',
    level: 'B1',
  }));
}

// Build 7 T4 bank items from the same slug
function makeT4Set(slug, authorBase) {
  const names = [`${authorBase}a`,`${authorBase}b`,`${authorBase}c`,`${authorBase}d`,
                 `${authorBase}e`,`${authorBase}f`,`${authorBase}g`];
  return Array.from({ length: 7 }, (_, i) => ({
    id: `de-b1-l-t4-${slug}-q${i+1}`,
    module: 'lesen',
    teil: 4,
    type: 'ja_nein',
    question: `Sagt die Person: Thema ist ${slug}?`,
    signText: `Meinung von ${names[i]}: Ich finde das Thema ${slug} sehr wichtig, weil es viele Menschen betrifft und die Gesellschaft verändert. Das sollte man bedenken.`,
    correct: i % 2 === 0 ? 'Ja' : 'Nein',
    correctAnswer: i % 2 === 0 ? 'Ja' : 'Nein',
    explanation: `${names[i]} befürwortet das Thema ${slug} ausdrücklich in ihrer Meinung.`,
    options: [],
    lang: 'de',
    level: 'B1',
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: T3-fresh — buildValidatedT3Part produces a valid batch
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── TEST T3-fresh ──');
try {
  const batch = buildValidatedT3Part();
  assert(Array.isArray(batch.questions) && batch.questions.length === 7,
    'returns exactly 7 questions');
  const opts0 = batch.questions[0].options;
  assert(Array.isArray(opts0) && opts0.length === 10,
    'first item has 10 options (A-J list)');
  const fp = opts0.join('|');
  const allSame = batch.questions.every(q => (q.options||[]).join('|') === fp);
  assert(allSame, 'all 7 items share the same A-J options list');
  const qcRes = checkLesenBatchQuality(batch, 3);
  assert(qcRes.ok, `passes checkLesenBatchQuality (issues: ${(qcRes.issues||[]).join('; ')})`);
} catch (err) {
  console.error(`  ❌ buildValidatedT3Part() threw: ${err.message}`);
  failed++;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: T4-fresh — buildValidatedT4Part produces a coherent batch
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── TEST T4-fresh ──');
try {
  const batch = buildValidatedT4Part();
  assert(Array.isArray(batch.questions) && batch.questions.length === 7,
    'returns exactly 7 questions');
  assert(isCoherentT4Batch(batch.questions),
    'isCoherentT4Batch: unique authors, distinct signTexts, each >= 15 words');
  const qcRes = checkLesenBatchQuality(batch, 4);
  assert(qcRes.ok, `passes checkLesenBatchQuality (issues: ${(qcRes.issues||[]).join('; ')})`);
} catch (err) {
  console.error(`  ❌ buildValidatedT4Part() threw: ${err.message}`);
  failed++;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: T3-bank-ok — bank has exactly one complete coherent T3 set
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── TEST T3-bank-ok (reutilización de set coherente) ──');
try {
  const set = makeT3Set('SetAlpha', 'de-b1-l-t3-alpha');
  const bank = minBank(set);
  const bp = minBlueprintT3();

  // No generator registered → must find the bank set
  const saved = globalThis.LesenPartGenerators;
  delete globalThis.LesenPartGenerators;

  const result = ExamBlueprint.assemble(bank, bp, {});
  globalThis.LesenPartGenerators = saved;

  const t3cov = result.coverage?.find(c => c.teil === 3);
  assert(t3cov?.complete === true, 'T3 coverage.complete = true (set found in bank)');

  const lesenPart = result.lesenParts?.find(p => Number(p.teil) === 3);
  const items = lesenPart?.items || lesenPart?.questions || [];
  assert(items.length === 7, 'assembled T3 part has 7 items');

  // All items must have the same options list
  if (items.length >= 2) {
    const ref = (items[0].options || []).join('|');
    const coherent = items.every(it => (it.options||[]).join('|') === ref);
    assert(coherent, 'all assembled T3 items share the same A-J options list');
  }
} catch (err) {
  console.error(`  ❌ T3-bank-ok threw: ${err.message}`);
  failed++;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: T3-reject — 2 sets of 7 in bank, no generator → coverage = false
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── TEST T3-reject (sets mezclados, sin generador → rechazo de cobertura) ──');
try {
  const setA = makeT3Set('SetA', 'de-b1-l-t3-seta');
  const setB = makeT3Set('SetB', 'de-b1-l-t3-setb');
  // Mix: 4 from setA + 3 from setB (7 total, but incoherent)
  const mixed = [...setA.slice(0, 4), ...setB.slice(0, 3)];
  const bank = minBank(mixed);
  const bp = minBlueprintT3();

  // Temporarily remove generator to simulate browser context
  const saved = globalThis.LesenPartGenerators;
  delete globalThis.LesenPartGenerators;

  const result = ExamBlueprint.assemble(bank, bp, {});
  globalThis.LesenPartGenerators = saved;

  const t3cov = result.coverage?.find(c => c.teil === 3);
  assert(t3cov?.complete === false || (t3cov?.filled || 0) < 7,
    'T3 coverage.complete = false when only mixed-set items exist and no generator');
} catch (err) {
  console.error(`  ❌ T3-reject threw: ${err.message}`);
  failed++;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: T4-reject — incoherent T4 items (4+3 from different slugs), no generator
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── TEST T4-reject (T4 ítems de 2 fuentes, sin generador → rechazo) ──');
try {
  const slugA = makeT4Set('autofrei', 'Maria');
  const slugB = makeT4Set('klimawandel', 'Hans');
  // 4 from slugA + 3 from slugB → no complete coherent group of 7
  const mixed = [...slugA.slice(0, 4), ...slugB.slice(0, 3)];
  const bank = minBank(mixed);
  const bp = minBlueprintT4();

  const saved = globalThis.LesenPartGenerators;
  delete globalThis.LesenPartGenerators;

  const result = ExamBlueprint.assemble(bank, bp, {});
  globalThis.LesenPartGenerators = saved;

  const t4cov = result.coverage?.find(c => c.teil === 4);
  assert(t4cov?.complete === false || (t4cov?.filled || 0) < 7,
    'T4 coverage.complete = false when only mixed-source items exist and no generator');
} catch (err) {
  console.error(`  ❌ T4-reject threw: ${err.message}`);
  failed++;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: CHK-21-fire — T4 with duplicate author triggers CHK-21 IMPORTANT
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── TEST CHK-21-fire (autores duplicados → CHK-21 IMPORTANT) ──');
try {
  // 7 T4 items where 2 share author "Anna" and have identical signText
  const names = ['Anna', 'Anna', 'Klaus', 'Maria', 'Peter', 'Stefan', 'Jana'];
  const dupAuthorItems = Array.from({ length: 7 }, (_, i) => ({
    id: `test-t4-dup-author-q${i+1}`,
    module: 'lesen',
    teil: 4,
    type: 'ja_nein',
    question: `Sagt ${names[i]}: Das Thema Klimaschutz ist wichtig?`,
    signText: `Meinung von ${names[i]}: Ich finde das Thema Klimaschutz sehr wichtig, weil unsere Umwelt geschützt werden muss und wir Verantwortung für die Zukunft tragen. Das betrifft uns alle täglich.`,
    correct: i % 2 === 0 ? 'Ja' : 'Nein',
    correctAnswer: i % 2 === 0 ? 'Ja' : 'Nein',
    explanation: `${names[i]} befürwortet den Klimaschutz ausdrücklich in ihrer persönlichen Meinung zu diesem Thema.`,
    options: [],
    lang: 'de',
    level: 'B1',
  }));

  const fakeBatch = { questions: dupAuthorItems };
  const tmpFile = path.join(os.tmpdir(), '_test-chk21-fixture.json');
  writeFileSync(tmpFile, JSON.stringify(fakeBatch, null, 2), 'utf8');

  const r = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'audit-pass-2.mjs'),
    tmpFile,
    '--fail-on=IMPORTANT',
  ], { cwd: ROOT, encoding: 'utf8' });

  try { unlinkSync(tmpFile); } catch (_) {}

  const output = r.stdout + r.stderr;
  const hasCHK21 = output.includes('CHK-21');
  const exitedWithError = r.status !== 0;
  assert(hasCHK21, `audit-pass-2 emits CHK-21 finding for duplicate T4 authors`);
  assert(exitedWithError, `audit-pass-2 exits with error code when --fail-on IMPORTANT (exit=${r.status})`);
} catch (err) {
  console.error(`  ❌ CHK-21-fire threw: ${err.message}`);
  failed++;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n══ Resultados: ${passed} passed, ${failed} failed ══`);
if (failed > 0) process.exit(1);
