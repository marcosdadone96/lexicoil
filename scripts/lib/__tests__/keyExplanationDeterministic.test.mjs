import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeExplanationMismatch,
  applyDeterministicExplanationFixes,
} from '../keyExplanationGate.mjs';

test('deterministic explanation fix clears CHK-18b when wrong option had higher overlap', () => {
  const batch = {
    module: 'lesen',
    teil: 5,
    questions: [
      {
        id: 'gen-q-test-1',
        module: 'lesen',
        teil: 5,
        type: 'multiple_choice',
        correct: 'a',
        options: [
          'a) Man muss die Gebühr vor Ort bar bezahlen.',
          'b) Die Anmeldung ist nur online möglich.',
          'c) Mitglieder dürfen ohne Anmeldung trainieren.',
        ],
        explanation:
          'Mitglieder dürfen jederzeit ohne vorherige Anmeldung ins Studio kommen und trainieren.',
      },
    ],
  };

  assert.ok(analyzeExplanationMismatch(batch.questions[0], batch));
  const { batch: fixedBatch, fixed: nFixed } = applyDeterministicExplanationFixes(batch);
  assert.equal(nFixed, 1);
  assert.equal(analyzeExplanationMismatch(fixedBatch.questions[0], fixedBatch), null);
});
