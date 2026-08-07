#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  PASSAGE_VOCAB_ENRICH_BACKLOG,
  bankPassagesExcludingEnrichBacklog,
} from '../bankPassageEnrichBacklog.mjs';

const sample = [
  { id: 'a', passageVocab: Array(10).fill('x') },
  { id: 'gen-l5-ca10ed0e', passageVocab: [] },
  { id: 'b', passageVocab: Array(10).fill('y') },
];

assert.equal(bankPassagesExcludingEnrichBacklog(sample).length, 2);
assert.equal(PASSAGE_VOCAB_ENRICH_BACKLOG.size, 3);
console.log('bankPassageEnrichBacklog: OK');
