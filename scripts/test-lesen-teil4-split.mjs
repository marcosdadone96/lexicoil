#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const Split = require(path.join(ROOT, 'js/engine/generators/lesenTeil4Split.js'));
const PB = require(path.join(ROOT, 'js/engine/prompts/PromptBuilder.js'));
const EG = require(path.join(ROOT, 'js/engine/generators/ExamGenerator.js'));

function ok(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const part = {
  teil: 4,
  slotType: 'forum_opinions',
  instruction: 'Lesen Sie die Meinungen 20 bis 26 zu einem Thema.',
  questionsTotal: { min: 7, max: 7 },
};

ok('parseItemIdRange 20-26', Split.parseItemIdRange(part).join(',') === '20,21,22,23,24,25,26');
ok('itemIdBatches 3+3+1', Split.itemIdBatches(part).length === 3);
ok('phaseCount is 4', Split.phaseCount(part) === 4);

const chunk = {
  expectKey: 'lesenParts',
  teil: 4,
  blueprintPart: part,
};
ok('detects lesen t4 chunk', Split.isLesenForumT4Chunk(chunk));
ok('max tokens capped', Split.MAX_TOKENS <= 6000);

const merged = Split.mergeParts('lesenParts', { teil: 4, instruction: 'x', textTitle: 'Topic?' }, [
  { id: '22', signText: 'Opinion B', type: 'ja_nein', correct: 'N' },
  { id: '20', signText: 'Opinion A', type: 'ja_nein', correct: 'J' },
]);
ok('merge sorts by id', merged.lesenParts[0].items.map((i) => i.id).join(',') === '20,22');
ok('merge strips options', merged.lesenParts[0].items[0].options === undefined);

const ER = require(path.join(ROOT, 'js/engine/examRenumber.js'));
const combined = ER.mergeItemsById(
  [{ id: '20', signText: 'a' }, { id: '21', signText: 'b' }],
  [{ id: '22', signText: 'c' }, { id: '23', signText: 'd' }],
);
ok('mergeItemsById accumulates 4', combined.length === 4);
ok('mergeItemsById order', combined.map((i) => i.id).join(',') === '20,21,22,23');

const dupTarget = { lesenParts: [{ teil: 4, items: [{ id: '20', signText: 'x' }, { id: '21', signText: 'y' }] }] };
ER.mergeTeilPart(dupTarget, {
  lesenParts: [{
    teil: 4,
    items: [
      { id: '20', signText: 'x' },
      { id: '21', signText: 'y' },
      { id: '22', signText: 'z' },
      { id: '23', signText: 'w' },
      { id: '24', signText: 'v' },
      { id: '25', signText: 'u' },
      { id: '26', signText: 't' },
    ],
  }],
}, 'lesen', 4, null);
ok('mergeTeilPart replaces partial t4 with full', dupTarget.lesenParts[0].items.length === 7);

const blueprint = require(path.join(ROOT, 'library/blueprints/goethe_B1.json'));
const spec = {
  contentType: 'VocabularyExercise',
  language: 'german',
  level: 'B1',
  topic: 'health',
  targetWords: ['Gesundheit'],
  skills: ['lesen'],
  personalTeilFilter: 4,
  constraints: {},
};
const built = PB.buildPersonalExamChunksFromBlueprint(spec, blueprint);
ok('personal t4 chunk marked split', built.chunks.some((c) => c.lesenT4Split));
const t4 = built.chunks.find((c) => Number(c.teil) === 4);
ok('t4 maxTokens <= 6000', t4 && t4.maxTokens <= 6000);
ok('ticket budget covers split', EG.computeMaxChunks(built.chunks) >= 4);

console.log('\nLesen Teil 4 split tests passed.');
