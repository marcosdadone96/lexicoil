#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const { validateGeneratedExam } = require(path.join(ROOT, 'netlify/functions/lib/examQualityGate.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const validExam = {
  goetheFormat: true,
  lesenParts: [
    {
      text: 'Beispieltext zum Lesen und Verstehen.',
      items: [
        {
          id: 'l1',
          question: 'Test?',
          options: ['a) One', 'b) Two', 'c) Three'],
          correct: 'b',
        },
      ],
    },
  ],
  horenParts: [
    {
      transcript: 'Moderator: Willkommen. Gast: Danke.',
      segments: [
        {
          id: 'h1',
          question: 'Topic?',
          options: ['A) X', 'B) Y', 'C) Z'],
          correct: 'B',
        },
      ],
    },
  ],
};

assert('quality gate accepts valid exam', validateGeneratedExam(validExam).valid);

const noCorrect = JSON.parse(JSON.stringify(validExam));
noCorrect.lesenParts[0].items[0].correct = '';
assert('0 correct rejected', !new ExamValidator().validate(noCorrect).valid);
assert('quality gate rejects missing correct', !validateGeneratedExam(noCorrect).valid);

const multiCorrect = JSON.parse(JSON.stringify(validExam));
multiCorrect.lesenParts[0].items[0].correct = ['a', 'b'];
assert('multiple correct array rejected on mcq', !new ExamValidator().validate(multiCorrect).valid);

const dupOptions = JSON.parse(JSON.stringify(validExam));
dupOptions.lesenParts[0].items[0].options = ['a) One', 'a) Also one', 'c) Three'];
assert('duplicate options rejected', !new ExamValidator().validate(dupOptions).valid);

const emptyOption = JSON.parse(JSON.stringify(validExam));
emptyOption.lesenParts[0].items[0].options = ['a) One', 'b)', 'c) Three'];
assert('empty option text rejected', !new ExamValidator().validate(emptyOption).valid);

const wrongKey = JSON.parse(JSON.stringify(validExam));
wrongKey.lesenParts[0].items[0].correct = 'z';
assert('correct not in options rejected', !new ExamValidator().validate(wrongKey).valid);

const flagged = JSON.parse(JSON.stringify(validExam));
flagged.lesenParts[0].items[0].options = [
  { key: 'a', text: 'One' },
  { key: 'b', text: 'Two', correct: true },
  { key: 'c', text: 'Three' },
];
assert('option correct flags with matching key accepted', new ExamValidator().validate(flagged).valid);

const doubleFlag = JSON.parse(JSON.stringify(flagged));
doubleFlag.lesenParts[0].items[0].options[2].correct = true;
assert('two option correct flags rejected', !new ExamValidator().validate(doubleFlag).valid);

const placeholders = JSON.parse(JSON.stringify(validExam));
placeholders.lesenParts[0].items[0].question = '.... .... .... .... .... ....';
assert('placeholder-heavy exam rejected by gate', !validateGeneratedExam(placeholders).valid);

console.log('\nExam quality gate tests passed.');
