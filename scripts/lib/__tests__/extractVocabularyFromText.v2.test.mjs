/**
 * Unit checks for vocabulary tag extractor v2 / v2.1.
 *   node scripts/lib/__tests__/extractVocabularyFromText.v2.test.mjs
 */
import {
  extractVocabularyFromText,
  enrichBatchMetadata,
} from '../enrichBatchMetadata.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const tags = extractVocabularyFromText(
  'Meine Familie findet den Alltag gut. Urlaub und Umzug brauchen Hilfe. Eine entspanntere Erfahrung.',
  10,
);
const lower = tags.map((t) => t.toLowerCase());
console.log('tags', tags);

assert(tags.includes('Alltag'), 'Alltag capitalized');
assert(tags.includes('Urlaub'), 'Urlaub capitalized');
assert(!lower.includes('findet'), 'no findet');
assert(lower.includes('finden') || lower.includes('brauchen'), 'verb infinitive present');
assert(!lower.includes('braucht'), 'no braucht');
assert(!lower.includes('entspannter'), 'no inflected adj');
assert(lower.includes('entspannt'), 'adj base entspannt');
assert(!lower.includes('sich'), 'no sich');
assert(!lower.includes('mein'), 'no mein');

const adj = extractVocabularyFromText('eine nachhaltigere Lösung', 4);
assert(adj.some((t) => t === 'Lösung'), 'Lösung noun');
assert(adj.some((t) => t.toLowerCase() === 'nachhaltig'), 'nachhaltig base');
assert(!adj.some((t) => /loes$/i.test(t)), 'no over-stripped loes');

const fake = {
  questions: [
    {
      type: 'matching',
      question: 'Jan möchte Russisch lernen.',
      correct: 'A',
      options: [
        'A) OstWort — Nachhilfe in Russisch online.',
        'B) SprachTor — Arabisch und Schrift.',
        'C) SpielFix — Konsolen reparieren.',
      ],
      explanation: 'Passt zu Russisch.',
    },
    {
      type: 'matching',
      question: 'Ben braucht eine Reparatur für die Spielkonsole.',
      correct: 'C',
      options: [
        'A) OstWort — Nachhilfe in Russisch online.',
        'B) SprachTor — Arabisch und Schrift.',
        'C) SpielFix — Konsolen reparieren.',
      ],
      explanation: 'Passt zu Konsole.',
    },
  ],
};
const { batch: out } = enrichBatchMetadata(fake, {
  topic: false,
  grammar: false,
  vocab: true,
  forceVocab: true,
});
const s0 = [...out.questions[0].vocabularyTags].map((t) => t.toLowerCase()).sort().join('|');
const s1 = [...out.questions[1].vocabularyTags].map((t) => t.toLowerCase()).sort().join('|');
assert(s0 !== s1, 'matching questions must not share identical vocab tag sets');
console.log('q0', out.questions[0].vocabularyTags);
console.log('q1', out.questions[1].vocabularyTags);

console.log('extractVocabularyFromText v2 tests passed.');
