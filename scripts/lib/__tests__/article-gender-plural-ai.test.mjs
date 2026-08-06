#!/usr/bin/env node
/**
 * Plural compound nouns → AI gender safety net (Einwegflaschen class).
 * Run: node scripts/lib/__tests__/article-gender-plural-ai.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const ArticleLexicon = require(path.join(ROOT, 'js/data/articleLexicon.js'));
const ManualVocab = require(path.join(ROOT, 'js/data/manualVocab.js'));
const { buildGenderPrompt, cleanGenderResponse, resolveGermanGender } = require(
  path.join(ROOT, 'netlify/functions/lib/freeTranslate.js'),
);

ArticleLexicon.loadSync(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lexicon/de-gender.json'), 'utf8')));

let passed = 0;
let failed = 0;

function assertOk(label, cond) {
  if (cond) {
    console.log('  ✅', label);
    passed += 1;
  } else {
    console.log('  ❌', label);
    failed += 1;
  }
}

function assertEq(label, a, b) {
  assertOk(label, a === b);
}

function enrich(word) {
  const fc = { word, sourceLang: 'de' };
  ManualVocab.enrichFlashcard(fc, 'de');
  return fc;
}

console.log('\n── P1: plural morphology heuristic (unknown compounds) ──');
for (const w of ['Einwegflaschen', 'Recyclingautomaten']) {
  assertOk(`${w} likely plural unknown`, ArticleLexicon.likelyPluralUnknownDe(w, 'de'));
}
// Already resolved by lexicon heuristics (no AI needed) — not "unknown plural"
assertOk('Haltestellen lexicon hit', !!ArticleLexicon.lookupGender('Haltestellen', 'de'));
assertOk('Pfandstationen lexicon hit', !!ArticleLexicon.lookupGender('Pfandstationen', 'de'));
assertOk('Glasfaserkabelkanal not likely plural', !ArticleLexicon.likelyPluralUnknownDe('Glasfaserkabelkanal', 'de'));
assertOk('Schüler not likely plural', !ArticleLexicon.likelyPluralUnknownDe('Schüler', 'de'));
assertOk('Mädchen not likely plural', !ArticleLexicon.likelyPluralUnknownDe('Mädchen', 'de'));

console.log('\n── P2: needsAiGenderFallback includes unknown plurals ──');
{
  const fc = enrich('Einwegflaschen');
  assertEq('Einwegflaschen is noun', fc.type, 'noun');
  assertOk('no lexicon hit', !ArticleLexicon.lookupGender('Einwegflaschen', 'de'));
  assertOk('needs AI fallback', ManualVocab.needsAiGenderFallback(fc, 'de'));
}

console.log('\n── P3: plural-aware prompt + response parser ──');
assertOk(
  'plural prompt mentions plural',
  buildGenderPrompt('Einwegflaschen', { likelyPlural: true }).includes('plural noun'),
);
assertEq('clean die plural', cleanGenderResponse('die plural').article, 'die');
assertOk('clean die plural flag', cleanGenderResponse('die plural').plural);
assertEq('clean singular der', cleanGenderResponse('der').article, 'der');
assertOk('clean singular not plural', !cleanGenderResponse('der').plural);

console.log('\n── P4: live Gemini (when API key present) ──');
const hasKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
if (!hasKey) {
  console.log('  ⏭  skip live AI (no GEMINI_API_KEY)');
} else {
  for (const word of ['Einwegflaschen', 'Recyclingautomaten']) {
    const likelyPlural = ArticleLexicon.likelyPluralUnknownDe(word, 'de');
    const r = await resolveGermanGender(word, { likelyPlural });
    assertEq(`${word} → die`, r.article, 'die');
    assertOk(`${word} plural flag`, r.plural || likelyPlural);
  }
  const sing = await resolveGermanGender('Glasfaserkabelkanal', { likelyPlural: false });
  assertEq('Glasfaserkabelkanal → der', sing.article, 'der');
  assertOk('Glasfaserkabelkanal not plural', !sing.plural);
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
