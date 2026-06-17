#!/usr/bin/env node
/**
 * Locked metadata schema — resolver + soft validator tests.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/analytics/types.js'));
const MetadataResolver = require(path.join(ROOT, 'js/core/metadataResolver.js'));
const SchemaValidator = require(path.join(ROOT, 'js/core/schemaValidator.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

// --- Resolver hierarchy ---
const exam = { level: 'B1', grammarTags: ['g-exam'], topicTags: ['exam-topic'], difficulty: 4 };
const part = { grammarTags: ['g-part'], topicTags: ['part-topic'], vocabularyTags: ['v-part'], difficulty: 6 };
const question = { grammarTags: ['g-q'], topicTags: ['q-topic'], vocabularyTags: ['v-q'], difficulty: 8 };

const resolved = MetadataResolver.resolveQuestionMetadata(question, part, exam);
assert('question grammarTags win', JSON.stringify(resolved.grammarTags) === '["g-q"]');
assert('question topicTags win', JSON.stringify(resolved.topicTags) === '["q-topic"]');
assert('question vocabularyTags win', JSON.stringify(resolved.vocabularyTags) === '["v-q"]');
assert('question difficulty wins', resolved.difficulty === 8);

const fromPart = MetadataResolver.resolveQuestionMetadata({}, part, exam);
assert('part grammarTags fallback', JSON.stringify(fromPart.grammarTags) === '["g-part"]');
assert('part difficulty fallback', fromPart.difficulty === 6);

const fromExam = MetadataResolver.resolveQuestionMetadata({}, {}, exam);
assert('exam grammarTags fallback', JSON.stringify(fromExam.grammarTags) === '["g-exam"]');
assert('exam difficulty fallback', fromExam.difficulty === 4);

const legacy = MetadataResolver.resolveQuestionMetadata({}, {}, { level: 'B2' });
assert('CEFR default difficulty B2', legacy.difficulty === 6);
assert('empty tags default', legacy.grammarTags.length === 0 && legacy.topicTags.length === 0);

const empty = MetadataResolver.resolveQuestionMetadata(null, null, null);
assert('null inputs safe', empty.grammarTags.length === 0 && empty.difficulty === null);

// --- Legacy exam without metadata ---
const legacyExam = {
  goetheFormat: true,
  level: 'B1',
  topic: 'Umwelt',
  lesenParts: [
    {
      teil: 1,
      text: 'Text.',
      questions: [
        { id: 'l1', type: 'multiple', question: 'Q?', options: ['a) x', 'b) y'], correct: 'b' },
      ],
    },
  ],
  horenParts: [
    {
      teil: 1,
      segments: [{ id: 'h1', question: 'Q?', options: ['a) x', 'b) y'], correct: 'a' }],
    },
  ],
};

const ev = new ExamValidator();
const base = ev.validate(legacyExam);
assert('legacy exam still valid', base.valid === true);

const metaLegacy = SchemaValidator.validateExamMetadata(legacyExam);
assert('legacy exam metadata audit valid', metaLegacy.valid === true);
assert('legacy exam no metadata warnings', metaLegacy.warnings.length === 0);

const walk = [...MetadataResolver.walkResolvedMetadata(legacyExam)];
assert('walk legacy scorable entities', walk.length >= 2);
assert('walk legacy resolves CEFR default', walk[0].metadata.difficulty === 5);

// --- Tagged exam ---
const taggedExam = {
  ...legacyExam,
  topicTags: ['umwelt'],
  difficulty: 3,
  lesenParts: [
    {
      teil: 1,
      topicTags: ['technologie'],
      questions: [
        {
          id: 'l1',
          type: 'multiple',
          question: 'Q?',
          options: ['a) x', 'b) y'],
          correct: 'b',
          grammarTags: ['g-de-b1-nebensatz'],
          vocabularyTags: ['stadtgarten'],
          difficulty: 7,
        },
      ],
    },
  ],
};

const taggedResolved = MetadataResolver.resolveQuestionMetadata(
  taggedExam.lesenParts[0].questions[0],
  taggedExam.lesenParts[0],
  taggedExam,
);
assert('tagged question grammar', taggedResolved.grammarTags[0] === 'g-de-b1-nebensatz');
assert('tagged question vocab', taggedResolved.vocabularyTags[0] === 'stadtgarten');
assert('tagged question difficulty', taggedResolved.difficulty === 7);

const taggedMeta = SchemaValidator.validateExamMetadata(taggedExam);
assert('tagged exam metadata valid', taggedMeta.valid === true);
assert('tagged exam metadata present', taggedMeta.metadataPresent === true);

// --- Malformed metadata (warnings only) ---
const badMeta = SchemaValidator.validateMetadataFields({
  grammarTags: 'not-array',
  difficulty: 99,
});
assert('malformed metadata still valid flag', badMeta.valid === true);
assert('malformed metadata produces warnings', badMeta.warnings.length >= 2);

const extended = SchemaValidator.extendExamValidation(legacyExam, base);
assert('extendExamValidation keeps structural valid', extended.valid === true);

console.log('\nMetadata schema tests passed.');
