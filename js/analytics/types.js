/**
 * LexiCoil analytics metadata types (optional fields — backward compatible).
 * JSDoc contracts for the locked exam/question metadata schema.
 */

/** @typedef {string} GrammarTagId — ID from knowledge/languages/{lang}.json grammar[].id */

/** @typedef {string} TopicTagSlug — Controlled topic/domain slug */

/** @typedef {string} VocabularyTagId — Vocabulary cluster or word-family tag */

/**
 * Optional metadata on a scorable question (or part/exam fallback).
 * All fields optional; absence is valid.
 * @typedef {Object} QuestionMetadataFields
 * @property {GrammarTagId[]} [grammarTags]
 * @property {TopicTagSlug[]} [topicTags]
 * @property {VocabularyTagId[]} [vocabularyTags]
 * @property {number} [difficulty] — 1 (easiest) to 10 (hardest) within CEFR level
 */

/**
 * Resolved metadata for one question after hierarchy merge.
 * @typedef {Object} ResolvedQuestionMetadata
 * @property {GrammarTagId[]} grammarTags
 * @property {TopicTagSlug[]} topicTags
 * @property {VocabularyTagId[]} vocabularyTags
 * @property {number|null} difficulty — null when no value at any level and no CEFR default
 */

/**
 * Optional metadata at exam root (global fallback only).
 * @typedef {QuestionMetadataFields} ExamMetadataFields
 */

/**
 * Per-tag accuracy rollup stored in analytics history / mastery profile.
 * @typedef {Object} TagStat
 * @property {number} correct
 * @property {number} total
 */

/**
 * Tag stats snapshot on a history entry (computed at submit time).
 * @typedef {Object} ExamTagStats
 * @property {Record<GrammarTagId, TagStat>} [grammarTags]
 * @property {Record<TopicTagSlug, TagStat>} [topicTags]
 * @property {Record<VocabularyTagId, TagStat>} [vocabularyTags]
 */

const LexiCoilMetadataTypes = Object.freeze({
  /** Locked field names — do not alias or rename. */
  FIELD_GRAMMAR: 'grammarTags',
  FIELD_TOPIC: 'topicTags',
  FIELD_VOCABULARY: 'vocabularyTags',
  FIELD_DIFFICULTY: 'difficulty',

  DIFFICULTY_MIN: 1,
  DIFFICULTY_MAX: 10,

  /** CEFR anchor when difficulty omitted everywhere (question > part > exam). */
  LEVEL_DEFAULT_DIFFICULTY: Object.freeze({
    A1: 2,
    A2: 3,
    B1: 5,
    B2: 6,
    C1: 8,
    C2: 9,
  }),
});

if (typeof window !== 'undefined') window.LexiCoilMetadataTypes = LexiCoilMetadataTypes;
if (typeof module !== 'undefined') module.exports = LexiCoilMetadataTypes;
