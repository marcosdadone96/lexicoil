/**
 * v2.3.16 — vocabulary lemma corruption regressions (live enrich path).
 * Run: node scripts/lib/__tests__/enrichBatchMetadata.vocab-corruption.test.mjs
 */
import {
  extractVocabularyFromText,
  enrichBatchMetadata,
  isVocabLemmaCorruption,
  VOCAB_TAGS_NORMALIZE_VERSION,
} from '../enrichBatchMetadata.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';

let passed = 0;
let failed = 0;

function assert(desc, cond) {
  if (cond) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    failed++;
  }
}

function assertTagsNoCorruption(desc, tags) {
  const bad = /(?:eren|chen|anen|elen|een|sophi|berli|direken|interessanen|handelen|weiterhi)$/i;
  assert(`${desc} (no corrupt suffix)`, !tags.some((t) => bad.test(String(t).toLowerCase())));
}

function finalizePathEnrich(batch) {
  return enrichBatchMetadata(structuredClone(batch), {
    fillGrammarDefaults: false,
    vocab: true,
    grammar: false,
    topic: false,
  }).batch;
}

console.log(`\n── vocab corruption ${VOCAB_TAGS_NORMALIZE_VERSION} ──\n`);

const b1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/vocab/de/B1.json'), 'utf8'));
const b1Set = new Set((b1.lemmas || []).map((w) => String(w).toLowerCase()));

// —— Verbs -ern (3sg -t) ——
for (const [surface, want] of [
  ['fördert', 'fördern'],
  ['erweitert', 'erweitern'],
  ['verhindert', 'verhindern'],
  ['fördern', 'fördern'],
  ['erweitern', 'erweitern'],
]) {
  const tags = extractVocabularyFromText(`Die Stadt ${surface} den Plan.`, 8);
  assert(`${surface} → ${want} in extract`, tags.map((t) => t.toLowerCase()).includes(want));
  assertTagsNoCorruption(`${surface} extract`, tags);
}

// —— Adjectives -t ——
for (const [surface, want] of [
  ['schlecht', 'schlecht'],
  ['schlechter', 'schlecht'],
  ['direkt', 'direkt'],
  ['wichtig', 'wichtig'],
]) {
  const tags = extractVocabularyFromText(`Das Ergebnis ist ${surface} für alle Bewohner in der Stadt.`, 8);
  assert(`${surface} not corrupted`, !tags.some((t) => /schlechen|direken/i.test(String(t))));
  if (want === surface) {
    assert(`${surface} in tags or absent-not-corrupt`, tags.map((t) => t.toLowerCase()).includes(want) || !tags.some((t) => t.toLowerCase() === 'schlechen'));
  }
}

// —— Nouns / names (must not truncate) ——
for (const w of ['Sophie', 'Berlin', 'Verkehr', 'Stadt']) {
  const tags = extractVocabularyFromText(`${w} ist wichtig.`, 8);
  assert(`${w} preserved`, tags.some((t) => t.toLowerCase() === w.toLowerCase()));
}

// —— Known artifacts must repair or drop ——
assert('direken not emitted', !extractVocabularyFromText('Text mit direken Wort.', 8).includes('direken'));
assert(
  'interessanen not emitted',
  !extractVocabularyFromText('Viele interessanen sich.', 8).some((t) => /interessanen/i.test(t)),
);

// —— Finite map (classic -en verbs) ——
assert('findet→finden', extractVocabularyFromText('Er findet den richtigen Weg in der Stadt.', 8).includes('finden'));
assert('braucht→brauchen', extractVocabularyFromText('Man braucht mehr Zeit in der Stadt.', 8).includes('brauchen'));

// —— Live finalizePoolReady-style path (Hören T4 + Lesen T2) ——
{
  const h4 = finalizePathEnrich({
    lang: 'de',
    level: 'B1',
    module: 'horen',
    teil: 4,
    passages: [
      {
        id: 'p1',
        text: 'Paul sagt: Wir müssen den öffentlichen Verkehr fördern und Staus verhindern. Das ist schlecht geplant.',
      },
    ],
    questions: [
      {
        id: 'q1',
        question: 'Was wird diskutiert?',
        vocabularyTags: ['fördern', 'verhindern', 'schlecht', 'Verkehr'],
      },
    ],
  });
  assertTagsNoCorruption('Hören T4 live path', h4.questions[0].vocabularyTags);
  assert('Hören T4 keeps fördern', h4.questions[0].vocabularyTags.map((t) => t.toLowerCase()).includes('fördern'));
}

{
  const l2 = finalizePathEnrich({
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil: 2,
    questions: [
      {
        id: 'q1',
        question: 'Die Leute kaufen weniger.',
        vocabularyTags: ['Leute', 'kaufen'],
      },
    ],
  });
  assertTagsNoCorruption('Lesen T2 live path', l2.questions[0].vocabularyTags);
  assert('Lesen T2 keeps Leute', l2.questions[0].vocabularyTags.some((t) => /^leute$/i.test(t)));
}

// —— isVocabLemmaCorruption helper ——
assert('corruption förderen', isVocabLemmaCorruption('fördert', 'förderen', b1Set));
assert('corruption schlechen', isVocabLemmaCorruption('schlecht', 'schlechen', b1Set));
assert('ok fördern', !isVocabLemmaCorruption('fördern', 'fördern', b1Set));

console.log(`\n── Result: ${passed} passed, ${failed} failed ──\n`);
if (failed) process.exit(1);
