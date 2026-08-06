/**
 * Mixed (weak present / strong past) German verbs + separable compounds.
 * DWDS-verified: brennen, kennen, denken, nennen, rennen, senden, wenden + compounds.
 * Run: node scripts/lib/__tests__/verbConjugation.mixed-verbs.test.mjs
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

function pratEr(verb) {
  return VerbConjugation.getPraeteritum(verb, 'de')?.forms?.er;
}

const ROOTS = [
  ['brennen', 'brannte', 'gebrannt'],
  ['kennen', 'kannte', 'gekannt'],
  ['denken', 'dachte', 'gedacht'],
  ['nennen', 'nannte', 'genannt'],
  ['rennen', 'rannte', 'gerannt'],
  ['senden', 'sandte', 'gesandt'],
  ['wenden', 'wandte', 'gewandt'],
];

console.log('\n── Mixed verb roots (Präteritum er + Partizip II) ──');
for (const [v, prat, part] of ROOTS) {
  assertEq(`${v} Prät. er`, pratEr(v), prat);
  assertEq(`${v} Partizip`, partizip(v), part);
}

console.log('\n── Separable compounds in system ──');
assertEq('anbrennen Partizip', partizip('anbrennen'), 'angebrannt');
assertEq('anbrennen Prät. er', pratEr('anbrennen'), 'brannte an');
assertEq('auskennen Partizip', partizip('auskennen'), 'ausgekannt');
assertEq('auskennen Prät. er', pratEr('auskennen'), 'kannte aus');
assertEq('anerkennen Partizip', partizip('anerkennen'), 'anerkannt');
assertEq('anerkennen Prät. er', pratEr('anerkennen'), 'erkannte an');
assertEq('antreffen Partizip', partizip('antreffen'), 'angetroffen');
assertEq('antreffen Prät. er', pratEr('antreffen'), 'traf an');

console.log('\n── Fused compound kennenlernen (not prefix-split) ──');
assertEq('kennenlernen Partizip', partizip('kennenlernen'), 'kennengelernt');
assertEq('kennenlernen Prät. er', pratEr('kennenlernen'), 'lernte kennen');
assertEq('kennenlernen Präs. er', VerbConjugation.getPresent('kennenlernen', 'de')?.forms?.er, 'lernt kennen');
assertEq('kennenlernen Perf. ich', VerbConjugation.getPerfekt('kennenlernen', 'de')?.forms?.ich, 'habe kennengelernt');

console.log('\n── Separable wenden compounds ──');
assertEq('anwenden Partizip', partizip('anwenden'), 'angewandt');
assertEq('abwenden Partizip', partizip('abwenden'), 'abgewandt');

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
process.exit(failed ? 1 : 0);
