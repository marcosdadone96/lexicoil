#!/usr/bin/env node
/**
 * Regression: pool topic retags must survive enrichBatchMetadata (grammar-only pass).
 * Bug: alignQuestionTopicTagsToRequestedTopic preferred stale _requestedTopic over topicTag.
 * Run: node scripts/lib/__tests__/enrichBatchMetadata.topic-retag.test.mjs
 */
import assert from 'node:assert/strict';
import { enrichBatchMetadata } from '../enrichBatchMetadata.mjs';
import { alignQuestionTopicTagsToRequestedTopic } from '../topicRotation.mjs';

/** Minimal Lesen T4 slice — lesen-t4-cur-society after B-retag to Umwelt. */
const lesenT4Retagged = {
  module: 'lesen',
  teil: 4,
  level: 'A2',
  topicTag: 'Umwelt',
  _requestedTopic: 'Konsum',
  passages: [
    {
      id: 'gen-p-lesen-t4-cur-society-s1',
      module: 'lesen',
      teil: 4,
      level: 'A2',
      title: 'Pfandflaschen-Verkauf',
      text: 'Wir verkaufen Mehrwegflaschen mit Pfand. Umweltfreundlich und spülbar.',
      topicTag: 'Umwelt',
    },
  ],
  questions: [
    {
      id: '16-deadbeef',
      module: 'lesen',
      teil: 4,
      level: 'A2',
      type: 'matching',
      topicTags: ['Umwelt'],
      grammarTags: ['g-de-b1-komparativ'],
      question: 'Welche Anzeige passt?',
      correct: 'a',
    },
  ],
};

const aligned = alignQuestionTopicTagsToRequestedTopic(structuredClone(lesenT4Retagged));
assert.equal(aligned.topicTag, 'Umwelt', 'align prefers topicTag over stale _requestedTopic');
assert.equal(aligned._requestedTopic, 'Umwelt', 'align syncs _requestedTopic to root');
assert.equal(aligned.passages[0].topicTag, 'Umwelt');
assert.deepEqual(aligned.questions[0].topicTags, ['Umwelt']);

const { batch: enriched } = enrichBatchMetadata(structuredClone(lesenT4Retagged), {
  topic: false,
  grammar: true,
  forceGrammar: true,
  vocab: false,
});
assert.equal(enriched.topicTag, 'Umwelt', 'enrichBatchMetadata must not revert retag to Konsum');
assert.equal(enriched._requestedTopic, 'Umwelt');
assert.equal(enriched.passages[0].topicTag, 'Umwelt');
assert.deepEqual(enriched.questions[0].topicTags, ['Umwelt']);
assert.ok(
  !(enriched.questions[0].grammarTags || []).some((t) => /^g-de-b1-/.test(t)),
  'grammar pass still runs',
);

console.log('PASS: enrichBatchMetadata.topic-retag');
