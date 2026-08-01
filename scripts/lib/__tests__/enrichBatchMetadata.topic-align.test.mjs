#!/usr/bin/env node
/** Post-enrich: question topicTags follow _requestedTopic (Hören B2 regression). */
import assert from 'node:assert/strict';
import { enrichBatchMetadata } from '../enrichBatchMetadata.mjs';
import { alignQuestionTopicTagsToRequestedTopic } from '../topicRotation.mjs';

const horenBatch = {
  module: 'horen',
  teil: 2,
  level: 'B2',
  topicTag: 'Medien',
  _requestedTopic: 'Medien',
  passages: [{ id: 'p1', module: 'horen', teil: 2, level: 'B2', text: 'Interview Medien …', topicTag: 'Medien' }],
  questions: [
    {
      id: 'q1',
      module: 'horen',
      teil: 2,
      level: 'B2',
      type: 'multiple_choice',
      question: 'Frage zu Medien.',
      topicTags: ['Sport'],
    },
    {
      id: 'q2',
      module: 'horen',
      teil: 2,
      level: 'B2',
      type: 'multiple_choice',
      question: 'Noch eine Frage.',
      topicTags: ['Wohnen'],
    },
  ],
};

const aligned = alignQuestionTopicTagsToRequestedTopic(structuredClone(horenBatch));
for (const q of aligned.questions) {
  assert.deepEqual(q.topicTags, ['Medien'], `${q.id} topicTags`);
}

const { batch: enriched } = enrichBatchMetadata(structuredClone(horenBatch), {
  topic: false,
  grammar: false,
  vocab: false,
});
for (const q of enriched.questions) {
  assert.deepEqual(q.topicTags, ['Medien'], `enriched ${q.id}`);
}

console.log('PASS: enrichBatchMetadata.topic-align (Hören B2 _requestedTopic)');
