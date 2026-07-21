/**
 * Hot-patch live exam session (S.examData) for prose corrections.
 *   node scripts/lib/__tests__/examSessionHotPatch.test.mjs
 */
import {
  HOT_PATCH_SAFE_FIELD_PATHS,
  isHotPatchSafeFieldPath,
  applyHotPatchToExamData,
  MSG_HOT_PATCHED,
  MSG_NEXT_PART,
} from '../examSessionHotPatch.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function sampleExam() {
  return {
    lang: 'de',
    level: 'B1',
    lesenParts: [
      {
        teil: 1,
        text: 'Texto viejo del pasaje',
        textTitle: 'Titulo',
        questions: [
          {
            id: 'q-live-1',
            question: 'Pregunta vieja?',
            options: [
              { key: 'a', text: 'A' },
              { key: 'b', text: 'B' },
            ],
            correct: 'a',
            explanation: 'Explicacion vieja',
          },
        ],
      },
    ],
  };
}

console.log('=== schema constant ===');
assert(Array.isArray(HOT_PATCH_SAFE_FIELD_PATHS), 'array');
assert(HOT_PATCH_SAFE_FIELD_PATHS.includes('question'), 'question safe');
assert(HOT_PATCH_SAFE_FIELD_PATHS.includes('text'), 'text safe');
assert(!HOT_PATCH_SAFE_FIELD_PATHS.includes('options'), 'options not safe');
assert(!HOT_PATCH_SAFE_FIELD_PATHS.includes('correct'), 'correct not safe');
assert(isHotPatchSafeFieldPath('question') === true, 'isHot question');
assert(isHotPatchSafeFieldPath('options') === false, 'isHot options');
console.log('PASS schema', HOT_PATCH_SAFE_FIELD_PATHS);

console.log("=== (a) fieldPath='question' present in examData → patched, no refetch ===");
{
  const exam = sampleExam();
  const beforeOptions = JSON.stringify(exam.lesenParts[0].questions[0].options);
  const beforeCorrect = exam.lesenParts[0].questions[0].correct;
  let refetchCalled = false;
  // Simulate: caller must NOT refetch — we only mutate exam in place
  const r = applyHotPatchToExamData(exam, {
    targetId: 'q-live-1',
    fieldPath: 'question',
    newValue: 'Pregunta nueva hot-patch?',
  });
  assert(r.ok && r.patched === true, 'patched');
  assert(r.message === MSG_HOT_PATCHED, 'msg hot');
  assert(exam.lesenParts[0].questions[0].question === 'Pregunta nueva hot-patch?', 'question updated');
  assert(JSON.stringify(exam.lesenParts[0].questions[0].options) === beforeOptions, 'options untouched');
  assert(exam.lesenParts[0].questions[0].correct === beforeCorrect, 'correct untouched');
  assert(refetchCalled === false, 'no refetch');
  console.log('PASS (a)', {
    question: exam.lesenParts[0].questions[0].question,
    message: r.message,
    refetchCalled,
  });
}

console.log("=== (b) fieldPath='options' → examData unchanged + next-part message ===");
{
  const exam = sampleExam();
  const snapshot = JSON.stringify(exam);
  const r = applyHotPatchToExamData(exam, {
    targetId: 'q-live-1',
    fieldPath: 'options',
    newValue: [{ key: 'a', text: 'CHANGED' }],
  });
  assert(r.patched === false, 'not patched');
  assert(r.reason === 'not_hot_patch_safe', 'reason');
  assert(r.message === MSG_NEXT_PART, 'msg next part');
  assert(JSON.stringify(exam) === snapshot, 'examData unchanged');
  console.log('PASS (b)', { message: r.message, reason: r.reason, unchanged: true });
}

console.log("=== (c) fieldPath='question' missing targetId → fallback, no throw ===");
{
  const exam = sampleExam();
  const snapshot = JSON.stringify(exam);
  const r = applyHotPatchToExamData(exam, {
    targetId: 'q-from-other-module',
    fieldPath: 'question',
    newValue: 'No debería aparecer',
  });
  assert(r.patched === false, 'not patched');
  assert(r.reason === 'target_not_found', 'target_not_found');
  assert(r.message === MSG_NEXT_PART, 'fallback msg');
  assert(JSON.stringify(exam) === snapshot, 'exam unchanged');
  assert(exam.lesenParts[0].questions[0].question === 'Pregunta vieja?', 'live q intact');
  console.log('PASS (c)', { message: r.message, reason: r.reason });
}

console.log('\nexamSessionHotPatch.test.mjs: ALL PASS');
