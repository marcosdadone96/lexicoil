import test from 'node:test';
import assert from 'node:assert/strict';
import ExamRenumber from '../../../js/engine/examRenumber.js';

test('Hören: segment questions only — no duplicate numbers when flat questions mirror segments', () => {
  const q1 = { statement: 'A' };
  const q2 = { statement: 'B' };
  const part = {
    teil: 1,
    segments: [{ questions: [q1, q2] }],
    questions: [q1, q2],
  };
  const exam = { horenParts: [part] };
  ExamRenumber.renumberExam(exam, null);
  const nums = ExamRenumber.scorableItems(exam.horenParts[0], 'horen').map((it) => Number(it.number));
  assert.deepEqual(nums, [1, 2]);
  assert.equal(new Set(nums).size, 2);
});
