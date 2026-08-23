/**
 * examStructureNormalize.test.mjs — segments authority + A2 L4 X option + sprechen topic.
 * Run: node scripts/lib/__tests__/examStructureNormalize.test.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { normalizeExamStructure, normalizeHorenPart } = require(path.join(
  ROOT,
  'js/engine/validation/normalizeExamStructure.js',
));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const { validateExamAgainstBlueprint } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintFidelity.js',
));

let passed = 0;
let failed = 0;

function assert(desc, cond) {
  if (cond) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    failed++;
  }
}

function countHorenItems(exam) {
  const v = new ExamValidator();
  let n = 0;
  v._walk({ horenParts: exam.horenParts }, () => {
    n += 1;
  });
  return n;
}

console.log('\n── Hören segments authority (no double count) ──');
const horenDup = {
  horenParts: [
    {
      teil: 1,
      segments: [{ questions: [{ id: 'q1', correct: 'a' }, { id: 'q2', correct: 'b' }] }],
      questions: [{ id: 'q1', correct: 'a' }, { id: 'q2', correct: 'b' }],
    },
  ],
};
assert('walk counts 2 not 4', countHorenItems(horenDup) === 2);

console.log('\n── Hören H4 flat → segment wrap ──');
const h4 = {
  teil: 4,
  transcript: 'Interview text',
  questions: [{ id: 'q1', correct: 'R' }, { id: 'q2', correct: 'F' }],
};
normalizeHorenPart(h4);
assert('H4 gets one segment', h4.segments?.length === 1);
assert('H4 segment has questions', h4.segments[0].questions?.length === 2);

console.log('\n── A2 Lesen T4 X option ──');
const exam = normalizeExamStructure(
  {
    level: 'A2',
    topic: 'Freizeit',
    lesenParts: [
      {
        teil: 4,
        ads: [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }, { key: 'e' }, { key: 'f' }],
        passages: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, text: 'ad' })),
        questions: [
          { id: '16', type: 'matching', correct: 'a', options: ['a) a', 'b) b'] },
          { id: '17', type: 'matching', correct: 'b', options: ['a) a', 'b) b'] },
          { id: '18', type: 'matching', correct: 'c', options: ['a) a', 'b) b'] },
          { id: '19', type: 'matching', correct: 'd', options: ['a) a', 'b) b'] },
          { id: '20', type: 'matching', correct: 'X', options: ['a) a', 'b) b'] },
        ],
      },
    ],
    sprechenParts: [{ teil: 1, situation: 'Stellen Sie sich vor.', taskType: 'intro' }],
  },
  { level: 'A2' },
);
const t4q = exam.lesenParts[0].questions[0];
assert('L4 options include X', (t4q.options || []).some((o) => /^x$/i.test(String(o))));
assert('sprechen topic from exam.topic', exam.sprechenParts[0].topic === 'Freizeit');

console.log('\n── B1 schreiben word targets ──');
const b1Exam = normalizeExamStructure(
  {
    level: 'B1',
    schreibenParts: [
      { teil: 1, minWords: 80, maxWords: 120 },
      { teil: 2, minWords: 80, maxWords: 120 },
      { teil: 3, minWords: 40, maxWords: 60 },
    ],
  },
  { level: 'B1' },
);
assert('B1 S1 maxWords clamped to 80', b1Exam.schreibenParts[0].maxWords === 80);
assert('B1 S3 maxWords clamped to 40', b1Exam.schreibenParts[2].maxWords === 40);

console.log('\n── B1 H4 stub speaker options ──');
const h4b1 = {
  teil: 4,
  transcript:
    'Moderator: Willkommen.\nFrau Keller: Ich bin dafür.\nHerr Brandt: Ich bin dagegen.',
  questions: [{ id: 'q1', type: 'matching', correct: 'b', options: ['a) a', 'b) b', 'c) c'] }],
};
normalizeHorenPart(h4b1, 'B1');
assert('H4 options have speaker labels', h4b1.questions[0].options[1].includes('Keller'));

console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
