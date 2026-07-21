/**
 * Finite 1sg/3sg + -ungen plural lemmas.
 * Run: node scripts/lib/__tests__/lemmatizer.finite-ung.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
const SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));

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

console.log('\n── 1sg -e / 3sg -t / 3sg -et finites ──');
const FINITES = [
  ['bleibe', 'bleiben'],
  ['bleibt', 'bleiben'],
  ['brauche', 'brauchen'],
  ['braucht', 'brauchen'],
  ['denke', 'denken'],
  ['denkt', 'denken'],
  ['bringt', 'bringen'],
  ['ruft', 'rufen'],
  ['nimmt', 'nehmen'],
  ['schlägt', 'schlagen'],
  ['macht', 'machen'],
  ['arbeitet', 'arbeiten'],
  ['findet', 'finden'],
  ['öffnet', 'öffnen'],
  ['wartet', 'warten'],
  ['kostet', 'kosten'],
  ['bedeutet', 'bedeuten'],
  ['endet', 'enden'],
  ['meldet', 'melden'],
  ['sendet', 'senden'],
  ['landet', 'landen'],
  ['bietet', 'bieten'],
  ['leitet', 'leiten'],
  ['antwortet', 'antworten'],
];
for (const [input, expected] of FINITES) {
  assertEq(input, Lemmatizer.normalizeLemma(input, 'de'), expected);
}

console.log('\n── -et noun / participle FPs (must not invent infinitives) ──');
const FPS = [
  ['internet', 'internet'],
  ['projektgebiet', 'projektgebiet'],
  ['hochbeet', 'hochbeet'],
  ['gearbeitet', 'gearbeitet'],
  ['angemeldet', 'angemeldet'],
];
for (const [input, expected] of FPS) {
  assertEq(input, Lemmatizer.normalizeLemma(input, 'de'), expected);
}

console.log('\n── -ungen / -ung nouns ──');
assertEq('Ablenkungen', Lemmatizer.normalizeLemma('Ablenkungen', 'de'), 'ablenkung');
assertEq('Ablenkung', Lemmatizer.normalizeLemma('Ablenkung', 'de'), 'ablenkung');
assertEq('Erfahrungen', Lemmatizer.normalizeLemma('Erfahrungen', 'de'), 'erfahrung');

console.log('\n── separable save reunify ──');
const r1 = SeparableResolve.resolveForSave('nimmt', 'Sie nimmt am Kurs teil.');
assertEq('nimmt+teil → teilnehmen', r1.word, 'teilnehmen');
assertEq('nimmt reunified', r1.reunified, true);
const r2 = SeparableResolve.resolveForSave('ruft', 'Er ruft seine Mutter an.');
assertEq('ruft+an → anrufen', r2.word, 'anrufen');
const r3 = SeparableResolve.resolveForSave('schlägt', 'Sie schlägt vor, früher zu kommen.');
assertEq('schlägt+vor → vorschlagen', r3.word, 'vorschlagen');
const r3b = SeparableResolve.resolveForSave(
  'schlägt',
  'Der Radiotipp schlägt vor, ein Picknick einzupacken und es im Park zu genießen.',
);
assertEq('schlägt vor, ein… → vorschlagen (comma+article)', r3b.word, 'vorschlagen');
assertEq('schlägt vor, ein… reunified', r3b.reunified, true);
const r3c2 = SeparableResolve.resolveForSave(
  'vor',
  'Der Radiotipp schlägt vor, ein Picknick einzupacken und es im Park zu genießen.',
);
assertEq('particle vor → vorschlagen', r3c2.word, 'vorschlagen');
const rAnbieten = SeparableResolve.resolveForSave(
  'bietet',
  'Eine Organisation bietet Programme an, die Familien helfen, sicherer im Internet unterwegs zu sein.',
);
assertEq('bietet+an → anbieten', rAnbieten.word, 'anbieten');
assertEq('bietet reunified', rAnbieten.reunified, true);
const rAnPart = SeparableResolve.resolveForSave(
  'an',
  'Eine Organisation bietet Programme an, die Familien helfen, sicherer im Internet unterwegs zu sein.',
);
assertEq('particle an → anbieten', rAnPart.word, 'anbieten');
const pairsAn = SeparableResolve.findSplitPairs(
  SeparableResolve.tokenize('Eine Organisation bietet Programme an, die Familien helfen.'),
);
assertEq('findSplitPairs finds anbieten', pairsAn.some((p) => p.lemma === 'anbieten'), true);
assertEq('findSplitPairs root=bietet', pairsAn[0]?.rootToken, 'bietet');
assertEq('findSplitPairs particle=an', pairsAn[0]?.particleToken, 'an');
const lineWrongAn =
  'Viele Schulen bieten auch gesündere Mittagsmenüs an, um Kinder früh an gute Gewohnheiten zu gewöhnen.';
const pairsWrong = SeparableResolve.findSplitPairs(SeparableResolve.tokenize(lineWrongAn));
assertEq('only one pair for bieten…an (not prep an)', pairsWrong.length, 1);
assertEq('pairs to particle an before comma', pairsWrong[0]?.particleTokenIndex < 10, true);
assertEq(
  'does not reunify prep an gute',
  SeparableResolve.resolveForSave('an', 'früh an gute Gewohnheiten zu gewöhnen.').reunified,
  false,
);
const r4 = SeparableResolve.resolveForSave('Haus', 'Das Haus ist groß.');
assertEq('non-separable Haus unchanged', r4.word.toLowerCase(), 'haus');
assertEq('non-separable not reunified', r4.reunified, false);
const r5 = SeparableResolve.resolveForSave('nimmt', 'Er nimmt den Bus.');
assertEq('nimmt without particle keeps surface/lemma', r5.reunified, false);
assertEq('nimmt alone lemmaUncertain or nehmen', r5.lemmaUncertain || r5.word === 'nehmen', true);
const r5b = SeparableResolve.resolveForSave('mit', 'Er fährt mit dem Bus zur Arbeit.');
assertEq('prep mit dem Bus NOT reunified', r5b.reunified, false);
const r6 = SeparableResolve.resolveForSave(
  'nimmt',
  'Sie nimmt nur einmal im Jahr an dem Training teil.',
);
assertEq('nimmt…teil long window → teilnehmen', r6.word, 'teilnehmen');
const pairs = SeparableResolve.findSplitPairs(
  SeparableResolve.tokenize('Der Radiotipp schlägt vor, ein Picknick einzupacken.'),
);
assertEq('findSplitPairs finds vorschlagen', pairs.some((p) => p.lemma === 'vorschlagen'), true);
assertEq('findSplitPairs root=schlägt', pairs[0]?.rootToken, 'schlägt');
assertEq('findSplitPairs particle=vor', pairs[0]?.particleToken, 'vor');

console.log('\n── localGloss (no AI) ──');
const gloss = SeparableResolve.localGloss('anbieten', 'en', 'de');
assertEq('localGloss anbieten en', gloss?.translation_en, 'to offer');
assertEq('localGloss source', gloss?.source, 'separable-gloss');
assertEq('localGloss es', SeparableResolve.localGloss('anbieten', 'es', 'de')?.translation_es, 'ofrecer');
assertEq('localGloss unknown null', SeparableResolve.localGloss('schwimmen', 'en', 'de'), null);

console.log('\n── MyMemory junk rejection (anbieten spam URL) ──');
const { isJunkTranslation, cleanTranslation } = require('../../../netlify/functions/lib/freeTranslate.js');
const spamUrl = 'https://fivestar-marketing.net/en/packages/trustpilot/';
assertEq('isJunk Trustpilot URL', isJunkTranslation(spamUrl), true);
assertEq('cleanTranslation drops spam', cleanTranslation(spamUrl), '');
assertEq('isJunk real gloss', isJunkTranslation('to offer'), false);
assertEq('gloss beats spam for anbieten', SeparableResolve.localGloss('anbieten', 'en', 'de')?.translation_en, 'to offer');

console.log('\n── wrap-time lemma wins over bare re-scan ──');
// Simulate resolveVocabFromSpan: if wrap already set anbieten, use it even if context is empty
function resolveFromWrapMeta(surface, wrapLemma, pairId, context) {
  if (wrapLemma && (pairId || SeparableResolve.SEPARABLE_INFINITIVES.has(wrapLemma))) {
    return { word: wrapLemma, surface, reunified: true };
  }
  return SeparableResolve.resolveForSave(surface, context);
}
const fromWrap = resolveFromWrapMeta('bietet', 'anbieten', 'sep_x_anbieten_0', '');
assertEq('wrap lemma → anbieten without context', fromWrap.word, 'anbieten');
assertEq('wrap lemma reunified', fromWrap.reunified, true);
// Without wrap lemma, empty context cannot reunify
const bare = resolveFromWrapMeta('bietet', '', '', '');
assertEq('no wrap + empty context not reunified', bare.reunified, false);

console.log('\n── ge- participle strip (gezeigt→zeigen, not gezeigen) ──');
assertEq('gezeigt→zeigen', Lemmatizer.normalizeLemma('gezeigt', 'de'), 'zeigen');
assertEq('gekippt→kippen', Lemmatizer.normalizeLemma('gekippt', 'de'), 'kippen');
assertEq('gesagt→sagen', Lemmatizer.normalizeLemma('gesagt', 'de'), 'sagen');
assertEq('gespielt→spielen', Lemmatizer.normalizeLemma('gespielt', 'de'), 'spielen');
assertEq('Gesundheit not gesundheien garbage', Lemmatizer.normalizeLemma('Gesundheit', 'de') !== 'gesundheien', true);
assertEq('gewährleistet lexical', Lemmatizer.normalizeLemma('gewährleistet', 'de'), 'gewährleisten');
assertEq('gefährdet lexical', Lemmatizer.normalizeLemma('gefährdet', 'de'), 'gefährden');
assertEq('genießt lexical', Lemmatizer.normalizeLemma('genießt', 'de'), 'genießen');

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
