#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const { validateGeneratedExam } = require(path.join(ROOT, 'netlify/functions/lib/examQualityGate.js'));
const { loadBlueprintFileSync } = require(path.join(ROOT, 'js/engine/validation/blueprintResolver.js'));
const {
  partExactTargetFromBlueprint,
  countMeetsBlueprintTarget,
  computeMinItems,
} = require(path.join(ROOT, 'netlify/functions/lib/partQualityGate.js'));
const { isAnswerKeyRenderable } = require(path.join(ROOT, 'js/engine/validation/isAnswerKeyRenderable.js'));

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

const adsMatchingExam = {
  goetheFormat: true,
  level: 'B1',
  lesenParts: [
    {
      teil: 3,
      instruction: 'Situationen 13–19',
      blueprintSlot: 'ads_matching',
      ads: [
        { key: 'a', text: 'Anzeige A' },
        { key: 'b', text: 'Anzeige B' },
        { key: 'c', text: 'Anzeige C' },
      ],
      items: [
        { id: '13', type: 'matching', signText: 'Situation eins', correct: 'A' },
        { id: '14', type: 'matching', signText: 'Situation zwei', correct: 'B' },
      ],
      questions: [],
    },
    {
      teil: 4,
      instruction: 'Meinungen 20–26',
      blueprintSlot: 'forum_opinions',
      textTitle: 'Handys in der Schule',
      items: [
        {
          id: '20',
          type: 'ja_nein',
          signText: 'Ich finde Handys im Unterricht gut.',
          correct: 'J',
        },
        {
          id: '21',
          type: 'ja_nein',
          signText: 'Handys sollten verboten sein.',
          correct: 'Nein',
        },
      ],
      questions: [],
    },
  ],
  horenParts: [
    {
      teil: 1,
      transcript: 'Guten Tag.',
      segments: [{ id: 'h1', question: 'Wer?', options: ['A) X', 'B) Y'], correct: 'A' }],
    },
  ],
};

assert('ads_matching items[] with part.ads accepted', new ExamValidator().validate(adsMatchingExam).valid);
assert('quality gate accepts ads_matching + forum items', validateGeneratedExam(adsMatchingExam, { blueprint: false }).valid);

const missingKeyAds = JSON.parse(JSON.stringify(adsMatchingExam));
missingKeyAds.lesenParts[0].items[0].correct = '';
const missingResult = new ExamValidator().validate(missingKeyAds);
assert('missing key on matching item rejected', !missingResult.valid);
assert(
  'missing key error names teil and id',
  missingResult.errors.some((e) => e.includes('exam_no_answer_key') && e.includes('teil=3') && e.includes('id=13')),
);

const goetheBp = loadBlueprintFileSync('goethe_B1');
assert('goethe B1 blueprint loads', !!goetheBp?.modules?.length);

const bpExam = JSON.parse(JSON.stringify(validExam));
bpExam.lang = 'de';
bpExam.level = 'B1';
bpExam.goetheFormat = true;
assert(
  'blueprint fidelity rejects partial exam (missing teile)',
  !validateGeneratedExam(bpExam, { blueprint: goetheBp, partialExam: false }).valid,
);
assert(
  'partial lesen-only exam skips missing blueprint modules',
  validateGeneratedExam(
    {
      lang: 'de',
      level: 'B1',
      goetheFormat: true,
      _sectionPart: true,
      lesenParts: [
        {
          teil: 4,
          blueprintSlot: 'forum_opinions',
          items: Array.from({ length: 7 }, (_, i) => ({
            id: String(20 + i),
            type: 'ja_nein',
            signText: `Meinung ${i + 1}`,
            correct: i % 2 ? 'J' : 'N',
          })),
        },
      ],
    },
    { blueprint: goetheBp },
  ).valid,
);

const lesenT2Partial = {
  lang: 'de',
  level: 'B1',
  goetheFormat: true,
  vocabPersonal: true,
  lesenParts: [
    {
      teil: 2,
      blueprintSlot: 'press_mcq',
      passages: [
        { passageId: 'A', textTitle: 'A', text: 'Erster Text mit genug Wörtern für Leseverstehen.' },
        { passageId: 'B', textTitle: 'B', text: 'Zweiter unabhängiger Text mit anderem Thema und genug Wörtern.' },
      ],
      questions: [
        ...Array.from({ length: 3 }, (_, i) => ({
          id: String(7 + i),
          passageId: 'A',
          type: 'multiple_choice',
          question: `Frage ${7 + i}?`,
          options: ['a) eins', 'b) zwei', 'c) drei'],
          correct: 'a',
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          id: String(10 + i),
          passageId: 'B',
          type: 'multiple_choice',
          question: `Frage ${10 + i}?`,
          options: ['a) eins', 'b) zwei', 'c) drei'],
          correct: 'b',
        })),
      ],
    },
  ],
};
const t2Gate = validateGeneratedExam(lesenT2Partial, { blueprint: goetheBp });
assert('partial lesen T2 dual passages validates', t2Gate.valid);

const ghostT2 = JSON.parse(JSON.stringify(lesenT2Partial));
ghostT2.lesenParts[0].passages = [{ passageId: 'A', text: 'Only one.' }];
ghostT2.lesenParts[0].questions[3].passageId = 'B';
const { validateLesenT2PassageIntegrity } = require(path.join(ROOT, 'js/engine/validation/lesenPassageIntegrity.js'));
assert(
  'Teil 2 ghost passageId B rejected',
  validateLesenT2PassageIntegrity(ghostT2.lesenParts[0]).some((e) => e.includes('passageId=B')),
);

const lesenT1Target = partExactTargetFromBlueprint(goetheBp, 'lesen', 1);
assert('lesen T1 blueprint target is 6', lesenT1Target === 6);
assert(
  'blueprint part gate requires exact count',
  countMeetsBlueprintTarget(goetheBp, 3, lesenT1Target) === false,
);
assert(
  'blueprint part gate accepts exact count',
  countMeetsBlueprintTarget(goetheBp, lesenT1Target, lesenT1Target) === true,
);
assert(
  'no-blueprint gate still uses fractional minimum',
  countMeetsBlueprintTarget(null, 3, 6) === true && computeMinItems(6) === 3,
);

const partAds = {
  ads: Array.from({ length: 10 }, (_, i) => ({ key: String.fromCharCode(65 + i) })),
};
assert(
  'shared isAnswerKeyRenderable: matching 0 with ads',
  isAnswerKeyRenderable({ id: 'x', type: 'matching', correct: '0', options: [] }, partAds),
);
assert(
  'shared isAnswerKeyRenderable: matching 0 without inject path fails',
  !isAnswerKeyRenderable(
    { id: 'y', type: 'matching', correct: '0', options: ['A) ad', 'B) ad'], _keyOnlyMatch: true },
    partAds,
  ),
);

console.log('\nExam quality gate tests passed.');
