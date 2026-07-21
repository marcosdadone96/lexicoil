/**
 * collapseIdenticalPassages — unit test with inline fixture (no disk dependency).
 * Run: node scripts/lib/__tests__/collapseIdenticalPassages.test.mjs
 */
import assert from 'node:assert/strict';
import { collapseIdenticalPassages, normalizeBatch } from '../normalizeBatch.mjs';

const text =
  'Guten Tag, liebe Reisefreunde! Heute möchte ich mit Ihnen über das Thema Reisen sprechen.';

const raw = {
  passages: [
    {
      id: 'gen-p-h2-84bf51f4',
      module: 'horen',
      teil: 2,
      title: 'Vortrag Reisen',
      text,
    },
    {
      id: 'gen-p-h2-84bf51f4-s1',
      module: 'horen',
      teil: 2,
      title: 'Vortrag Reisen',
      text,
    },
  ],
  questions: [
    {
      id: 'q1',
      module: 'horen',
      teil: 2,
      type: 'multiple_choice',
      question: 'Worum geht es?',
      options: ['a) A', 'b) B', 'c) C'],
      correct: 'a',
      passageId: 'gen-p-h2-84bf51f4-s1',
      lang: 'de',
      level: 'B1',
    },
  ],
};

assert.equal(raw.passages.length, 2);

const collapsed = collapseIdenticalPassages(raw);
assert.equal(collapsed.passages.length, 1, 'collapse → 1 passage');
assert.equal(collapsed.passages[0].id, 'gen-p-h2-84bf51f4', 'keeps non-s1 id');
assert.equal(collapsed.questions[0].passageId, 'gen-p-h2-84bf51f4', 'rewires question');

const normalized = normalizeBatch(structuredClone(raw), {
  module: 'horen',
  teil: 2,
  lang: 'de',
  level: 'B1',
});
assert.equal(normalized.passages.length, 1, 'normalizeBatch collapses duplicates');
assert.ok(
  normalized.questions.every((q) => q.passageId === normalized.passages[0].id),
  'questions point to kept passage',
);

// Distinct texts must NOT collapse (Hören T1)
const t1 = {
  passages: [
    { id: 's1', text: 'Buslinie fünf fährt heute anders.' },
    { id: 's2', text: 'Der Wertstoffhof nimmt Batterien an.' },
  ],
  questions: [],
};
assert.equal(collapseIdenticalPassages(t1).passages.length, 2, 'T1 distinct texts kept');

console.log('✓ collapseIdenticalPassages (identical collapse + T1 preserve)');
