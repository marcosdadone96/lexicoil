#!/usr/bin/env node
/**
 * Opcion A: buildExamFixNote incluye anti-B2+ Y anti-copia en Hören T1/T2 siempre.
 * Simula alternancia lexico -> calidad y verifica que ambos hints persisten.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const { buildExamFixNote } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/generatePartGeminiLib.mjs')).href
);
const { checkHorenBatchQuality } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/horenBatchQuality.mjs')).href
);
const { checkLexical } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/lexicalCheck.mjs')).href
);

function pass(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

const B2_ISSUE = 'gen-q-x: vocabulario B2+ en pregunta (Wohlbefinden)';
const COPY_ISSUE = 'gen-q-y: opcion correcta copia >=4 palabras del audio («gut genutzte Freizeit»)';

const noteLexico = buildExamFixNote([B2_ISSUE], 'lexico', 'horen', 2);
const noteCalidad = buildExamFixNote([COPY_ISSUE], 'calidad', 'horen', 2);

pass('T2 lexico retry includes ANTI-B2+', noteLexico.includes('ANTI-B2+'));
pass('T2 lexico retry includes ANTI WORD-MATCHING', noteLexico.includes('ANTI WORD-MATCHING'));
pass('T2 calidad retry includes ANTI-B2+', noteCalidad.includes('ANTI-B2+'));
pass('T2 calidad retry includes ANTI WORD-MATCHING', noteCalidad.includes('ANTI WORD-MATCHING'));

const noteT1 = buildExamFixNote([B2_ISSUE], 'lexico', 'horen', 1);
pass('T1 retry includes both hints', noteT1.includes('ANTI-B2+') && noteT1.includes('ANTI WORD-MATCHING'));

const noteT3 = buildExamFixNote([COPY_ISSUE], 'calidad', 'horen', 3);
pass('T3 copy-only keeps conditional copy hint', noteT3.includes('ANTI WORD-MATCHING'));
pass('T3 does not force ANTI-B2+ block', !noteT3.includes('ANTI-B2+'));

const noteT4Lex = buildExamFixNote([COPY_ISSUE], 'calidad', 'horen', 4, 'Wohnen');
const noteT4Len = buildExamFixNote(['515 palabras en transcripcion'], 'calidad', 'horen', 4, 'Wohnen');
pass('T4 calidad retry includes ANTI-LONGITUD', noteT4Lex.includes('ANTI-LONGITUD'));
pass('T4 calidad retry includes ANTI-COPIA', noteT4Lex.includes('ANTI-COPIA'));
pass('T4 calidad retry includes ANCLA TEMATICA Wohnen', noteT4Lex.includes('ANCLA TEMATICA') && noteT4Lex.includes('Wohnen'));
pass('T4 length retry keeps all three hints', noteT4Len.includes('ANTI-LONGITUD') && noteT4Len.includes('ANTI-COPIA') && noteT4Len.includes('Freizeit'));

const extraLen = (noteLexico.match(/ANTI-B2\+[\s\S]*ANTI WORD-MATCHING/) || [''])[0].length;
pass('combined hints ~2 lines (~120-280 chars)', extraLen >= 100 && extraLen <= 320);

// Simulated retry sequence on Freizeit fixture (024): no regression of the other axis in fix note
const fixturePath = path.join(ROOT, 'batches/ready/pool-verified/horen-t2-gemini-024.json');
let batch = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function injectB2(batch) {
  const q = batch.questions[0];
  q.question = 'Warum ist Wohlbefinden in der Freizeit wichtig?';
  q.options = [
    'a) Weil Wohlbefinden die Lebensqualitat stark beeinflusst.',
    'b) Weil man mehr arbeiten sollte.',
    'c) Weil Freizeit teuer ist.',
    'd) Weil Hobbys langweilig sind.',
  ];
  q.correctAnswer = 'a';
  return batch;
}

function injectCopy(batch) {
  const q = batch.questions[1];
  const snippet = batch.passages[0].text.split('.')[0];
  q.options = [
    `a) ${snippet}`,
    'b) Freizeit ist unwichtig.',
    'c) Man soll nie pausieren.',
    'd) Nur Sport zahlt.',
  ];
  q.correctAnswer = 'a';
  return batch;
}

const sequence = [];
let sim = structuredClone(batch);
sim = injectB2(sim);
let lex = checkLexical(sim);
sequence.push({ step: 1, gate: 'lexico', ok: lex.ok, fixNote: buildExamFixNote(lex.issues, 'lexico', 'horen', 2) });

sim = injectCopy(structuredClone(batch));
let qual = checkHorenBatchQuality(sim, 2);
sequence.push({ step: 2, gate: 'calidad', ok: qual.ok, fixNote: buildExamFixNote(qual.issues, 'calidad', 'horen', 2) });

for (const s of sequence) {
  pass(
    `sim step ${s.step} (${s.gate}) fix note has BOTH hints`,
    s.fixNote.includes('ANTI-B2+') && s.fixNote.includes('ANTI WORD-MATCHING'),
  );
}

console.log('\nSimulated alternating failures (Freizeit 024 fixture):');
for (const s of sequence) {
  console.log(
    `  step ${s.step} gate=${s.gate} ok=${s.ok} | dual-hint=${s.fixNote.includes('ANTI-B2+') && s.fixNote.includes('ANTI WORD-MATCHING')}`,
  );
}

console.log(process.exitCode ? '\nSome tests FAILED' : '\nAll horen-fix-note tests passed');
