#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const { loadBlueprintSync } = require(path.join(ROOT, 'js/engine/validation/blueprintResolver.js'));
const v = new ExamValidator();

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const READING_SNIPPET =
  'Die Nachhaltigkeit spielt in modernen Städten eine wichtige Rolle. Immer mehr Menschen interessieren sich für Umweltthemen, lokale Projekte und verantwortungsvolles Handeln im Alltag.';

const validExam = {
  goetheFormat: true,
  level: 'B1',
  lang: 'de',
  lesenParts: [
    {
      text: READING_SNIPPET,
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
      transcript: 'Moderator: Willkommen. Gast: Danke für die Einladung.',
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
  gapfill: {
    sentences: [{ id: 'g1', text: 'Hello ___', answer: 'world' }],
  },
};

assert('valid exam passes (default non-strict)', v.validate(validExam).valid);

const badMcq = JSON.parse(JSON.stringify(validExam));
badMcq.lesenParts[0].items[0].correct = 'z';
assert('mcq wrong key rejected', !v.validate(badMcq).valid);

const multiCorrect = JSON.parse(JSON.stringify(validExam));
multiCorrect.lesenParts[0].items[0].correct = ['a', 'b'];
assert('mcq multiple correct rejected', !v.validate(multiCorrect).valid);

const dupOpts = JSON.parse(JSON.stringify(validExam));
dupOpts.lesenParts[0].items[0].options = ['a) One', 'a) Dup', 'c) Three'];
assert('mcq duplicate options rejected', !v.validate(dupOpts).valid);

const emptyOpt = JSON.parse(JSON.stringify(validExam));
emptyOpt.lesenParts[0].items[0].options = ['a) One', 'b)', 'c) Three'];
assert('mcq empty option rejected', !v.validate(emptyOpt).valid);

const badGap = JSON.parse(JSON.stringify(validExam));
badGap.gapfill.sentences[0].answer = '';
assert('gap missing answer rejected', !v.validate(badGap).valid);

const badMatch = {
  goetheFormat: true,
  level: 'B1',
  lang: 'de',
  lesenParts: [
    {
      questions: [
        {
          id: 'm1',
          type: 'match',
          question: 'Who?',
          options: ['A', 'B', 'C', '0'],
          correct: 'X',
        },
      ],
      text: 'Sample text for reading.',
    },
  ],
  horenParts: [
    {
      transcript: 'Hi',
      segments: [{ id: 's1', question: 'Q?', options: ['a) 1', 'b) 2'], correct: 'a' }],
    },
  ],
};
assert('match invalid reference rejected', !v.validate(badMatch).valid);

const noPassage = JSON.parse(JSON.stringify(validExam));
delete noPassage.lesenParts[0].text;
assert('passage_missing rejected (non-strict)', !v.validate(noPassage).valid);

const noTranscript = JSON.parse(JSON.stringify(validExam));
delete noTranscript.horenParts[0].transcript;
assert('transcript_missing rejected (non-strict)', !v.validate(noTranscript).valid);

const shortPassage = JSON.parse(JSON.stringify(validExam));
shortPassage.lesenParts[0].text = 'Kurzer Text.';
const shortLoose = v.validate(shortPassage);
assert('passage_too_short is warning when non-strict', shortLoose.valid);
assert(
  'passage_too_short warning present',
  shortLoose.warnings.some((w) => w.startsWith('passage_too_short'))
);

const shortStrict = v.validate(shortPassage, { strict: true });
assert('passage_too_short rejected in strict', !shortStrict.valid);
assert(
  'passage_too_short error in strict',
  shortStrict.errors.some((e) => e.startsWith('passage_too_short'))
);

const blueprint = loadBlueprintSync({ lang: 'de', level: 'B1' });
assert('blueprint loads for de B1', !!blueprint);

const itemMismatch = JSON.parse(JSON.stringify(validExam));
const looseBp = v.validate(itemMismatch, { blueprint });
assert('item_count_mismatch warning when non-strict', looseBp.valid);
assert(
  'item_count_mismatch warning present',
  looseBp.warnings.some((w) => w.startsWith('item_count_mismatch'))
);

const strictBp = v.validate(itemMismatch, { blueprint, strict: true });
assert('item_count_mismatch rejected in strict', !strictBp.valid);

const longText = Array(160).fill('Wort').join(' ');
const goodStrict = {
  goetheFormat: true,
  level: 'B1',
  lang: 'de',
  lesenParts: [
    {
      text: longText,
      items: [
        {
          id: 'l1',
          question: 'Frage?',
          options: ['a) Eins', 'b) Zwei', 'c) Drei'],
          correct: 'a',
        },
      ],
    },
  ],
  horenParts: [
    {
      transcript: 'Moderator: Guten Tag. Gast: Hallo und willkommen.',
      segments: [
        {
          id: 'h1',
          question: 'Thema?',
          options: ['A) X', 'B) Y', 'C) Z'],
          correct: 'B',
        },
      ],
    },
  ],
};
const goodStrictResult = v.validate(goodStrict, { strict: true, blueprint: false });
assert(
  'known-good exam passes strict (length + passage; no blueprint item rules)',
  goodStrictResult.valid
);

assert('validate returns warnings array', Array.isArray(v.validate(validExam).warnings));

console.log('\nExamValidator tests passed.');
