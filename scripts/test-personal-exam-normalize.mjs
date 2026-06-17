#!/usr/bin/env node
/** Normalization fixes for AI personal exams (missing correct / alias fields). */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examGeneration.js'), 'utf8');
const start = src.indexOf('function inferQuestionCorrect');
const end = src.indexOf('function normalizeExam');
const fnBlock = src.slice(start, end);
const sandbox = { console, window: {}, sanitizeExamText: (t) => t };
vm.createContext(sandbox);
vm.runInContext(`${fnBlock}\nthis.normalize = normalizeGoetheExam;`, sandbox);

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

function validateLesen(exam) {
  const v = new ExamValidator().validate(exam, { strict: false, blueprint: false });
  const mcqMissing = v.errors.filter((e) => e.includes('mcq_missing_correct'));
  return { valid: v.valid, mcqMissing, errors: v.errors };
}

const base = {
  topic: 'Test',
  level: 'B1',
  lang: 'de',
  goetheFormat: true,
  lesenParts: [
    {
      teil: 1,
      text: 'Der Mann und die Frau arbeiten in der Ausbildung.',
      questions: [],
    },
  ],
};

const cases = [
  {
    name: 'answer alias → correct key',
    q: {
      id: 'l1',
      type: 'multiple',
      question: 'Wer arbeitet?',
      options: [
        { key: 'A', text: 'Der Mann' },
        { key: 'B', text: 'Die Frau' },
      ],
      answer: 'B',
    },
    expectCorrect: 'B',
  },
  {
    name: 'flagged option → correct key',
    q: {
      id: 'l2',
      type: 'multiple',
      question: 'Was ist Ausbildung?',
      options: [
        { key: 'A', text: 'Schule' },
        { key: 'B', text: 'Berufsausbildung', correct: true },
      ],
    },
    expectCorrect: 'B',
  },
  {
    name: 'rf with answer Richtig',
    q: { id: 'l3', type: 'rf', question: 'Der Text ist positiv.', answer: 'Richtig' },
    expectCorrect: 'R',
  },
];

for (const c of cases) {
  const exam = JSON.parse(JSON.stringify(base));
  exam.lesenParts[0].questions = [c.q];
  const normalized = sandbox.normalize(exam);
  const q = normalized.lesenParts[0].questions[0];
  ok(q.correct === c.expectCorrect, `${c.name} → correct=${q.correct}`);
  const v = validateLesen(normalized);
  ok(v.mcqMissing.length === 0, `${c.name} passes mcq_missing_correct check`);
}

const allBad = JSON.parse(JSON.stringify(base));
allBad.lesenParts = [1, 2, 3, 4].map((teil) => ({
  teil,
  text: 'Text über Mann, Frau, Ausbildung und Unterschied.',
  questions: [
    {
      id: `l${teil}a`,
      type: 'multiple',
      question: 'Frage A?',
      options: [{ key: 'A', text: 'eins' }, { key: 'B', text: 'zwei' }],
      solution: 'A',
    },
    {
      id: `l${teil}b`,
      type: 'multiple',
      question: 'Frage B?',
      options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b', isCorrect: true }],
    },
  ],
}));
const fixed = sandbox.normalize(allBad);
const vAll = validateLesen(fixed);
ok(vAll.mcqMissing.length === 0, `8-question AI-like payload: no mcq_missing_correct (${vAll.mcqMissing.length})`);
ok(vAll.valid || !vAll.errors.some((e) => e.includes('exam_no_answer_keys')), 'exam has scorable answer keys');

console.log('\nPersonal exam normalization tests passed.');
