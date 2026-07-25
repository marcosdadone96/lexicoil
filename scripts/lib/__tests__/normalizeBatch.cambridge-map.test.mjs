/**
 * normalizeBatch.cambridge-map.test.mjs
 * Etapa 2 EN: coerceGeneratedLesenPart must enforce the Cambridge B1 Reading
 * Teil->questionType map for lang 'en', keep Goethe map for 'de', and leave
 * other langs untouched. (docs/audit/gates-en-applicability.md, riesgo #2)
 * Run:  node scripts/lib/__tests__/normalizeBatch.cambridge-map.test.mjs
 */
import { coerceGeneratedLesenPart } from '../normalizeBatch.mjs';

let passed = 0, failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

function mkBatch(type) {
  return {
    passages: [{ id: 'p1', text: 'Sample passage text for the test.' }],
    questions: [{ id: 'q1', type, prompt: 'Q?', options: ['a) one', 'b) two', 'c) three'], correct: 'a' }],
  };
}

// EN: Cambridge map enforced per Teil
const enExpect = { 1: 'multiple_choice', 2: 'matching', 3: 'multiple_choice', 4: 'matching', 5: 'multiple_choice', 6: 'gap_fill' };
for (const [teil, want] of Object.entries(enExpect)) {
  const out = coerceGeneratedLesenPart(mkBatch('short_answer'), { teil: Number(teil), lang: 'en', level: 'B1' });
  assert(`EN T${teil} coerced to ${want}`, out.questions[0].type === want);
}

// DE: Goethe map still applies (T3 matching per TEIL_QUESTION_TYPE)
const de = coerceGeneratedLesenPart(mkBatch('multiple_choice'), { teil: 3, lang: 'de', level: 'B1' });
assert('DE T3 keeps Goethe map (matching)', de.questions[0].type === 'matching');

// ES: no map forced, generated type preserved
const es = coerceGeneratedLesenPart(mkBatch('short_answer'), { teil: 3, lang: 'es', level: 'B1' });
assert('ES type untouched', es.questions[0].type === 'short_answer');

console.log(`\nnormalizeBatch cambridge-map: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
