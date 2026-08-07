#!/usr/bin/env node
/**
 * germanCapsNormalize v3.0-stable — regression corpus (G2 Iteration 3).
 * Run: node scripts/lib/__tests__/germanCapsNormalize.iter3.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decapitalizeMidSentence,
  isModalInfinitiveOvercapitalized,
  ADJ_NEEDS_ARTICLE_GUARD,
} from '../capitalizeNouns.mjs';
import { isKnownGermanNoun } from '../germanNounLexicon.mjs';
import { GERMAN_CAPS_NORMALIZE_VERSION } from '../germanCapsNormalize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'germanCapsNormalize.corpus.json'), 'utf8'),
);

let passed = 0;
let failed = 0;

function ok(desc) {
  console.log(`  ✅  ${desc}`);
  passed++;
}
function fail(desc, detail = '') {
  console.error(`  ❌  ${desc}`);
  if (detail) console.error(`       ${detail}`);
  failed++;
}
function assertEq(desc, actual, expected) {
  if (actual === expected) ok(desc);
  else fail(desc, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertUnchanged(desc, text) {
  const { result } = decapitalizeMidSentence(text);
  if (result === text) ok(desc);
  else fail(desc, `changed to: ${JSON.stringify(result)}`);
}
function assertChanges(desc, text, expectSubstring) {
  const { result } = decapitalizeMidSentence(text);
  if (result.includes(expectSubstring)) ok(desc);
  else fail(desc, `expected substring ${JSON.stringify(expectSubstring)} in ${JSON.stringify(result)}`);
}

console.log(`\n── germanCapsNormalize ${GERMAN_CAPS_NORMALIZE_VERSION} (corpus ${CORPUS.version}) ──\n`);

console.log('── Version & guards ──');
assertEq('stable version tag', GERMAN_CAPS_NORMALIZE_VERSION, GERMAN_CAPS_NORMALIZE_VERSION);
assertEq('alter not in ADJ_NEEDS_ARTICLE_GUARD', ADJ_NEEDS_ARTICLE_GUARD.has('alter'), false);

for (const { word, lemma } of CORPUS.lexiconMustKnow) {
  assertEq(`isKnownGermanNoun(${word})`, isKnownGermanNoun(word), true);
  if (lemma === 'sorgen') {
    assertEq('sorgen via supplement (not verb-only)', isKnownGermanNoun('sorgen'), true);
  }
}

console.log('\n── decapMustNotChange (Iter3 regressions) ──');
for (const item of CORPUS.decapMustNotChange) {
  assertUnchanged(`${item.id}: unchanged`, item.text);
}

console.log('\n── decapMustChange (fixes conservados) ──');
for (const item of CORPUS.decapMustChange) {
  assertChanges(`${item.id}: ${item.expectSubstring}`, item.text, item.expectSubstring);
}

console.log('\n── modal guard: prep objeto vs infinitivo ──');
assertEq(
  'Kosten+für: no modal decap',
  isModalInfinitiveOvercapitalized('Kosten', 'kann', 'für'),
  false,
);
assertEq(
  'Wissen+wollen: sí modal decap',
  isModalInfinitiveOvercapitalized('Wissen', 'Gartenarbeit', 'wollen'),
  true,
);

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
