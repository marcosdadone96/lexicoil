#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  B2_GRAMMAR_IDS,
  countGrammarSignalsB2,
  inferGrammarTagsFromText,
  isValidGrammarTag,
  sanitizeGrammarTags,
} from '../enrichBatchMetadata.mjs';

const t1 =
  'Schreiben Sie einen Forumsbeitrag. Äußern Sie Ihre Meinung. Die Digitalisierung und Bildung sind wichtige Themen.';
const t2 =
  'Sie müssen verreisen. Schreiben Sie eine Nachricht an Ihren Vorgesetzten. Ihre Situation erfordert Verständnis.';

const c2 = countGrammarSignalsB2(t2);
assert.ok(c2['g-de-b2-modus'] >= 1, 'T2 consigna: modal+infinitiv');

const tags2 = inferGrammarTagsFromText(t2, 2, { level: 'B2' });
assert.ok(tags2.every((id) => id.startsWith('g-de-b2-')), tags2.join(', '));
assert.ok(!tags2.some((id) => id.includes('b1')), tags2.join(', '));

const bogus = sanitizeGrammarTags(['g-de-b1-nebensatz', 'g-de-b2-modus'], 'B2');
assert.deepEqual(bogus, ['g-de-b2-modus']);

const invented = sanitizeGrammarTags(
  ['g-de-b2-argumentation', 'g-de-b2-diskussion', 'g-de-b2-nominal'],
  'B2',
);
assert.deepEqual(invented, ['g-de-b2-nominal']);

assert.equal(B2_GRAMMAR_IDS.length, 6);
for (const id of B2_GRAMMAR_IDS) {
  assert.ok(isValidGrammarTag(id, 'B2'), id);
  assert.ok(!isValidGrammarTag(id, 'B1'), id);
}

console.log('PASS: B2 grammarTags taxonomy + inference');
