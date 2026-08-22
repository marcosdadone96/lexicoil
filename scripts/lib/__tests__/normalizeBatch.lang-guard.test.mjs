/**
 * normalizeBatch.lang-guard.test.mjs
 * Regression: German noun-capitalization must NOT run on non-German batches.
 * (docs/audit/gates-en-applicability.md, riesgos activos #1 y #2)
 * Run:  node scripts/lib/__tests__/normalizeBatch.lang-guard.test.mjs
 */
import { normalizeBatch } from '../normalizeBatch.mjs';

let passed = 0, failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

// 1) English text must be left untouched (no Team/Job/Meeting capitalization).
const enText = 'i have a meeting with my team about the computer problem';
const en = normalizeBatch(
  { passages: [{ id: 'p1', text: enText }], questions: [] },
  { module: 'lesen', teil: 3, lang: 'en', level: 'B1' },
);
assert('EN passage text unchanged (no de capitalization)', en.passages[0].text === enText);

// 2) Spanish likewise untouched.
const esText = 'tengo una reunion con mi equipo sobre el problema';
const es = normalizeBatch(
  { passages: [{ id: 'p1', text: esText }], questions: [] },
  { module: 'lesen', teil: 1, lang: 'es', level: 'B1' },
);
assert('ES passage text unchanged', es.passages[0].text === esText);

// 3) German still capitalizes nouns (behavior preserved).
const de = normalizeBatch(
  { passages: [{ id: 'p1', text: 'ich habe ein meeting mit meinem team' }], questions: [] },
  { module: 'lesen', teil: 2, lang: 'de', level: 'B1' },
);
assert('DE still capitalizes (Meeting/Team)', /Meeting/.test(de.passages[0].text) && /Team/.test(de.passages[0].text));

// 4) No lang provided defaults to German (historical behavior).
const def = normalizeBatch(
  { passages: [{ id: 'p1', text: 'ich habe ein team' }], questions: [] },
  { module: 'lesen', teil: 2 },
);
assert('default (no lang) => de capitalization', /Team/.test(def.passages[0].text));

console.log(`\nnormalizeBatch lang-guard: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
