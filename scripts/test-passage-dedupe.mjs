#!/usr/bin/env node
import {
  textSimilarity,
  validateCrossExamPassageUniqueness,
} from './lib/passageDedupe.mjs';

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

assert('identical text = 1.0', textSimilarity('Hallo Welt', 'Hallo Welt') === 1);
assert('different text low similarity', textSimilarity('abc def ghi', 'xyz uvw rst') < 0.3);

const unique = validateCrossExamPassageUniqueness([
  {
    id: 'a',
    exam: {
      lesenParts: [{ teil: 1, passageId: 'p1', text: 'Einzigartiger Text A mit genug Wörtern für Bigrams.' }],
    },
  },
  {
    id: 'b',
    exam: {
      lesenParts: [{ teil: 1, passageId: 'p2', text: 'Ganz anderer Inhalt B mit völlig anderen Sätzen und Wörtern.' }],
    },
  },
]);
assert('unique exams pass', unique.ok);

const dupId = validateCrossExamPassageUniqueness([
  {
    id: 'a',
    exam: { lesenParts: [{ teil: 1, passageId: 'shared-id', text: 'Text eins mit genug Länge für den Test.' }] },
  },
  {
    id: 'b',
    exam: { lesenParts: [{ teil: 2, passageId: 'shared-id', text: 'Anderer Text aber gleiche ID reicht.' }] },
  },
]);
assert('duplicate passageId fails', !dupId.ok && dupId.violations[0].type === 'duplicate_passageId');

const base =
  'Die Stadtverwaltung plant neue Radwege entlang der Hauptstraße. Bürger können Vorschläge einreichen bis Ende März.';
const similar = base.replace('Radwege', 'Fahrradwege');
const dupText = validateCrossExamPassageUniqueness([
  { id: 'a', exam: { lesenParts: [{ teil: 1, text: base }] } },
  { id: 'b', exam: { lesenParts: [{ teil: 1, text: similar }] } },
]);
assert('similar text >85% fails', !dupText.ok && dupText.violations[0].type === 'similar_passage_text');

console.log('\nPassage dedupe tests passed.');
