#!/usr/bin/env node
/**
 * Lesen Teil 2 split — merge logic and curated seed shape for pool fallback.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const LesenTeil2Split = require(path.join(ROOT, 'js/engine/generators/lesenTeil2Split.js'));
const { validateLesenT2PassageIntegrity } = require(path.join(
  ROOT,
  'js/engine/validation/lesenPassageIntegrity.js',
));
const { reusablePartToLesenPart } = require(path.join(
  ROOT,
  'js/engine/personalLesenPoolFallback.js',
));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const chunk = {
  expectKey: 'lesenParts',
  teil: 2,
  blueprintPart: {
    teil: 2,
    instruction: 'Lesen Sie die beiden Texte und die Aufgaben 7 bis 12.',
    slotType: 'press_mcq',
    passagesPerPart: 2,
  },
};
assert('T2 split chunk detected', LesenTeil2Split.isLesenT2SplitChunk({ ...chunk, lesenT2Split: true }));

const { aIds, bIds } = LesenTeil2Split.parseQuestionIdRange(chunk.blueprintPart);
assert('question ids A = 7,8,9', aIds.join(',') === '7,8,9');
assert('question ids B = 10,11,12', bIds.join(',') === '10,11,12');

const passageA = { passageId: 'A', textTitle: 'Text A', text: 'Kurzer Presseartikel A.' };
const passageB = { passageId: 'B', textTitle: 'Text B', text: 'Kurzer Presseartikel B.' };
const qA = aIds.map((id) => ({
  id,
  passageId: 'A',
  question: `Frage ${id}?`,
  correct: 'a',
  options: ['a) x', 'b) y', 'c) z'],
}));
const qB = bIds.map((id) => ({
  id,
  passageId: 'B',
  question: `Frage ${id}?`,
  correct: 'b',
  options: ['a) x', 'b) y', 'c) z'],
}));

const merged = LesenTeil2Split.mergeParts(
  'lesenParts',
  { instruction: chunk.blueprintPart.instruction },
  passageA,
  passageB,
  qA,
  qB,
);
const part = merged.lesenParts[0];
assert('merged has 2 passages', part.passages?.length === 2);
assert('merged has 6 questions', part.questions?.length === 6);
assert('T2 integrity passes', validateLesenT2PassageIntegrity(part).length === 0);

// Curated T2 → pool → reusablePartToLesenPart
const exams = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams/de_B1.json'), 'utf8'));
const t2 = exams[0].lesenParts.find((p) => Number(p.teil) === 2);
assert('curated exam has T2', !!t2?.passages?.length);

const poolShape = {
  id: 'cur-test-t2',
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 2,
  instruction: t2.instruction,
  passage: {
    passages: t2.passages.map((p) => ({
      passageId: p.passageId || p.id,
      textTitle: p.title || p.textTitle,
      text: p.text,
    })),
  },
  questions: t2.questions.map((q) => ({ ...q })),
};
const fromPool = reusablePartToLesenPart(poolShape);
assert('pool T2 converts with 2 passages', (fromPool.passages?.length || 0) >= 2);
assert('pool T2 has questions', (fromPool.questions?.length || 0) === 6);

console.log('\nLesen Teil 2 split tests passed.');
