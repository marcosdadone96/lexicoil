/**
 * Hyphenated German compounds must not lose stem-final -s/-e via stripSuffix,
 * nor invent infinitives via -st finite heuristics (Dienst → Dienen).
 * Run: node scripts/lib/__tests__/lemmatizer.hyphen.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));

let passed = 0;
let failed = 0;

function assertEq(desc, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log('\n── hyphen compound lemmas ──');

const CASES = [
  ['Yoga-Kurs', 'yoga-kurs'],
  ['yoga-kurs', 'yoga-kurs'],
  ['Yoga-Kurses', 'yoga-kurs'],
  ['Yoga-Kurse', 'yoga-kurs'],
  ['Vier-Tage-Woche', 'vier-tage-woche'],
  ['Streaming-Dienst', 'streaming-dienst'],
  ['Streaming-Dienste', 'streaming-dienst'],
  ['spanisch-nachhilfe', 'spanisch-nachhilfe'],
  ['Repair-Cafe', 'repair-cafe'],
  ['E-Mail', 'e-mail'],
  ['samstagvormittag-kurs', 'samstagvormittag-kurs'],
];

for (const [input, expected] of CASES) {
  assertEq(input, Lemmatizer.normalizeLemma(input, 'de'), expected);
}

// Non-hyphen bare -s strip still exists (genitive/plural path); document, don't change here
assertEq('autos → auto (bare -s still)', Lemmatizer.normalizeLemma('autos', 'de'), 'auto');

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
