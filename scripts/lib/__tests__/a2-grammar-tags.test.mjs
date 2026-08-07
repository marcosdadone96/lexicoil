#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  A2_GRAMMAR_IDS,
  countGrammarSignalsA2,
  inferGrammarTagsFromText,
  isValidGrammarTag,
  sanitizeGrammarTags,
} from '../enrichBatchMetadata.mjs';

const t = 'Tom sagt, dass er am Montag ins Museum geht. Katja muss den Kurs besuchen.';
const c = countGrammarSignalsA2(t);
assert.ok(c['g-de-a2-nebensatz'] >= 1);
assert.ok(c['g-de-a2-modal'] >= 1);

const tags = inferGrammarTagsFromText(t, 2, { level: 'A2', a2Matching: true });
assert.ok(tags.length >= 1);
assert.ok(tags.every((id) => id.startsWith('g-de-a2-')), tags.join(', '));
assert.ok(!tags.some((id) => id.includes('b1')), tags.join(', '));

const bogus = sanitizeGrammarTags(['g-de-b1-nebensatz', 'g-de-a2-modal'], 'A2');
assert.deepEqual(bogus, ['g-de-a2-modal']);

assert.equal(A2_GRAMMAR_IDS.length, 7);
for (const id of A2_GRAMMAR_IDS) {
  assert.ok(isValidGrammarTag(id, 'A2'), id);
  assert.ok(!isValidGrammarTag(id, 'B1'), id);
}

console.log('PASS: A2 grammarTags taxonomy + inference');
