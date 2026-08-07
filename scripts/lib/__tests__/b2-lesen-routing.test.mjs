#!/usr/bin/env node
/** B2 Lesen T1 — plantillas-lesen-b2 + banco desacoplado + instrucción Modellsatz. */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from '../loadEnv.mjs';
import {
  lesenTemplatePath,
  buildLesenStaticCore,
} from '../lesenTemplatePrompt.mjs';
import {
  GOETHE_B2_INSTRUCTIONS,
  assertLesenInstructionsMatch,
} from '../goethe-b2-modellsatz.mjs';
import { loadVocabBankLemmaSet } from '../vocabBank.mjs';
import { validateB2ForumPassageBank, loadB2ForumTextBank, remapB2ForumQuestionPassageIds, mergeB2ForumQuestions } from '../lesenB2ForumBank.mjs';
import { resolveLesenGenerationMolds } from '../lesenSubtypeRotation.mjs';
import { isPartPoolReady } from '../../audit-pass-2.mjs';

const L = 'B2';

const rel = path.relative(ROOT, lesenTemplatePath(1, L)).replace(/\\/g, '/');
assert.ok(rel.includes('plantillas-lesen-b2'), rel);
assert.ok(!rel.includes('lesen-b1'), rel);

const coreA = buildLesenStaticCore(1, { level: L, forumPhase: 'passage' });
const coreB = buildLesenStaticCore(1, { level: L, forumPhase: 'questions' });
const b1 = fs.readFileSync(path.join(ROOT, 'plantillas-lesen-b1/lesen-teil1.md'), 'utf8').slice(0, 80);

assert.ok(coreA.includes('Fase A') || coreA.includes('4 Personen'), 'Fase A prompt');
assert.ok(coreB.includes('9') && coreB.includes('matching'), 'Fase B prompt');
assert.ok(!coreA.includes(b1.slice(0, 50)), 'must not be B1 ich-blog template');
assert.ok(GOETHE_B2_INSTRUCTIONS.lesen[0].includes('Forum'), 'canonical T1 instruction');

const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B2.json'), 'utf8'));
const les = assertLesenInstructionsMatch(bp);
assert.equal(les.ok, true, les.issues.join(', '));
assert.equal(
  bp.modules.find((m) => m.id === 'lesen').parts[0].instruction,
  GOETHE_B2_INSTRUCTIONS.lesen[0],
);

const sample = {
  passages: ['A', 'B', 'C', 'D'].map((k, i) => ({
    id: `p-${k}`,
    personKey: k,
    title: `Person ${k}`,
    text: `Ich finde, dass ${'Thema '.repeat(80)} wichtig ist.`,
  })),
  questions: [],
};
assert.equal(validateB2ForumPassageBank(sample).ok, true);

const bankPath = path.join(ROOT, 'batches/ready/lesen-text-bank/B2/lesen-t1-gemini-208-text-bank.json');
if (fs.existsSync(bankPath)) {
  const bank = loadB2ForumTextBank(bankPath);
  const remapped = remapB2ForumQuestionPassageIds(bank.passages, [
    { id: 'q1', correct: 'B', passageId: 'wrong-id' },
    { id: 'q2', correctAnswer: 'D', passageId: 'also-wrong' },
  ]);
  assert.equal(remapped[0].passageId, 'gen-l1-d96ae980-b');
  assert.equal(remapped[1].passageId, 'gen-l1-d96ae980-d');

  const stubQs = ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A'].map((k, i) => ({
    id: `q-${i}`,
    module: 'lesen',
    teil: 1,
    level: 'B2',
    type: 'matching',
    question: `Aussage ${i + 1} zum Thema Medien.`,
    options: ['A', 'B', 'C', 'D'],
    correct: k,
    correctAnswer: k,
  }));
  const merged = mergeB2ForumQuestions(bank, { questions: stubQs });
  const pool = await isPartPoolReady(merged, { semantic: false, skipSem2: true });
  const chk8 = (pool.blocking || []).filter((f) => f.id === 'CHK-8');
  assert.equal(chk8.length, 0, chk8.map((f) => f.message).join('; '));
}

const b2Bank = loadVocabBankLemmaSet('de', 'B2');
assert.ok(b2Bank.size >= 1000);
assert.ok(fs.existsSync(path.join(ROOT, 'library/vocab/de/B2.json')));
assert.ok(fs.existsSync(path.join(ROOT, 'plantillas-lesen-b2/lesen-teil1.md')));

const relT2 = path.relative(ROOT, lesenTemplatePath(2, L)).replace(/\\/g, '/');
assert.ok(relT2.includes('plantillas-lesen-b2/lesen-teil2.md'), relT2);
const coreT2 = buildLesenStaticCore(2, { level: L });
const b1t2 = fs.readFileSync(path.join(ROOT, 'plantillas-lesen-b1/lesen-teil2.md'), 'utf8');
assert.ok(coreT2.includes('Sätze einfügen') || coreT2.includes('Lücken'), 'B2 T2 sentence insertion');
assert.ok(coreT2.includes('250') && coreT2.includes('400'), 'B2 T2 word bounds');
assert.ok(!coreT2.includes('2 textos de prensa'), 'must not be B1 press MCQ T2');
assert.equal(
  bp.modules.find((m) => m.id === 'lesen').parts[1].instruction,
  GOETHE_B2_INSTRUCTIONS.lesen[1],
  'blueprint T2 instruction byte match',
);

const relT3 = path.relative(ROOT, lesenTemplatePath(3, L)).replace(/\\/g, '/');
assert.ok(relT3.includes('plantillas-lesen-b2/lesen-teil3.md'), relT3);
const coreT3 = buildLesenStaticCore(3, { level: L });
const b2t3Raw = fs.readFileSync(path.join(ROOT, 'plantillas-lesen-b2/lesen-teil3.md'), 'utf8');
assert.ok(coreT3.includes('Zeitung') && coreT3.includes('350'), 'B2 T3 newspaper MCQ');
assert.ok(
  b2t3Raw.includes('Zeitungsartikel') && b2t3Raw.includes('PROHIBIDO') && b2t3Raw.includes('anuncios A–J'),
  'B2 T3 template is newspaper MCQ not B1 classified ads',
);
assert.equal(
  bp.modules.find((m) => m.id === 'lesen').parts[2].instruction,
  GOETHE_B2_INSTRUCTIONS.lesen[2],
  'blueprint T3 instruction byte match',
);

const relT4 = path.relative(ROOT, lesenTemplatePath(4, L)).replace(/\\/g, '/');
assert.ok(relT4.includes('plantillas-lesen-b2/lesen-teil4.md'), relT4);
const coreT4 = buildLesenStaticCore(4, { level: L });
const b1t4 = fs.readFileSync(path.join(ROOT, 'plantillas-lesen-b1/lesen-teil4.md'), 'utf8').slice(0, 80);
assert.ok(coreT4.includes('Meinungsäußerungen') || coreT4.includes('Überschrift'), 'B2 T4 opinion-headline');
assert.ok(coreT4.includes('40') && coreT4.includes('100'), 'B2 T4 word bounds per Meinung');
assert.ok(!coreT4.includes(b1t4.slice(0, 40)), 'must not be B1 forum ja_nein template');
assert.equal(
  bp.modules.find((m) => m.id === 'lesen').parts[3].instruction,
  GOETHE_B2_INSTRUCTIONS.lesen[3],
  'blueprint T4 instruction byte match',
);

const relT5 = path.relative(ROOT, lesenTemplatePath(5, L)).replace(/\\/g, '/');
assert.ok(relT5.includes('plantillas-lesen-b2/lesen-teil5.md'), relT5);
const coreT5 = buildLesenStaticCore(5, { level: L });
const b1t5 = fs.readFileSync(path.join(ROOT, 'plantillas-lesen-b1/lesen-teil5.md'), 'utf8').slice(0, 80);
assert.ok(coreT5.includes('Studienordnung') || coreT5.includes('Paragrafen'), 'B2 T5 rules matching');
assert.ok(coreT5.includes('200') && coreT5.includes('350'), 'B2 T5 word bounds Studienordnung');
assert.ok(!coreT5.includes(b1t5.slice(0, 40)), 'must not be B1 Hausordnung MCQ template');
assert.equal(
  bp.modules.find((m) => m.id === 'lesen').parts[4].instruction,
  GOETHE_B2_INSTRUCTIONS.lesen[4],
  'blueprint T5 instruction byte match',
);
assert.equal(
  GOETHE_B2_INSTRUCTIONS.lesen[4],
  'Lesen Sie die Studienordnung.\nWelche Überschriften aus dem Inhaltsverzeichnis passen zu den Paragrafen? Vier Überschriften werden nicht gebraucht.',
  'T5 instruction byte-for-byte vs Modellsatz',
);

assert.equal(resolveLesenGenerationMolds(5, { level: L, topicTag: 'Bildung' }), null, 'B2 T5 no B1 T5 molds');

console.log('PASS: B2 Lesen routing (T1 forum + T2 Sätze + T4 Meinung↔Überschrift + T5 Studienordnung, Modellsatz, B2 vocab)');
