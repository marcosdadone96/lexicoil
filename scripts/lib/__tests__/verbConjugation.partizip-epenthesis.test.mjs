/**
 * Partizip II epenthesis: planen→geplant (not geplanet); arbeiten→gearbeitet kept.
 * Run: node scripts/lib/__tests__/verbConjugation.partizip-epenthesis.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

globalThis.Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
globalThis.SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));
const VerbConjugation = require(path.join(ROOT, 'js/data/verbConjugation.js'));

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

function partizip(verb) {
  return VerbConjugation.getPerfekt(verb, 'de')?.partizip;
}

console.log('\n── Fix: vowel+n stems use -t only ──');
assertEq('planen → geplant', partizip('planen'), 'geplant');
assertEq('planen ich perf', VerbConjugation.getPerfekt('planen', 'de')?.forms?.ich, 'habe geplant');
assertEq('wohnen → gewohnt (table)', partizip('wohnen'), 'gewohnt');
assertEq('lernen → gelernt', partizip('lernen'), 'gelernt');
assertEq('kaufen → gekauft', partizip('kaufen'), 'gekauft');

console.log('\n── Keep: stems that need -et ──');
assertEq('arbeiten → gearbeitet', partizip('arbeiten'), 'gearbeitet');
assertEq('reden → geredet', partizip('reden'), 'geredet');
assertEq('antworten → geantwortet', partizip('antworten'), 'geantwortet');
assertEq('atmen → geatmet', partizip('atmen'), 'geatmet');
assertEq('zeichnen → gezeichnet', partizip('zeichnen'), 'gezeichnet');
assertEq('öffnen → geöffnet', partizip('öffnen'), 'geöffnet');

console.log('\n── Imperativ: plan not plane (no spurious -e after vowel+n) ──');
assertEq('planen du imp', VerbConjugation.getImperativ('planen', 'de')?.forms?.du, 'plan');
assertEq('arbeiten du imp', VerbConjugation.getImperativ('arbeiten', 'de')?.forms?.du, 'arbeit');
assertEq('öffnen du imp', VerbConjugation.getImperativ('öffnen', 'de')?.forms?.du, 'öffne');

console.log('\n── Präteritum unchanged (always stem+te) ──');
assertEq('planen prät ich', VerbConjugation.getPraeteritum('planen', 'de')?.forms?.ich, 'plante');

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
process.exit(failed ? 1 : 0);
