/**
 * Evidence: separable gloss coverage + FR/IT translation path for reunified + AI-lemma cases.
 * Run: node scripts/lib/__tests__/separable-ui-langs-fr-it.test.mjs
 */
import assert from 'assert';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));
const { resolveSeparableLemma, isJunkTranslation } = require(path.join(
  ROOT,
  'netlify/functions/lib/freeTranslate.js',
));

let passed = 0;
let failed = 0;
function assertEq(label, a, b) {
  try {
    assert.strictEqual(a, b);
    console.log('  ✅', label);
    passed += 1;
  } catch (_) {
    console.log('  ❌', label, 'got', JSON.stringify(a), 'expected', JSON.stringify(b));
    failed += 1;
  }
}
function assertOk(label, cond) {
  assertEq(label, !!cond, true);
}

const gloss = SeparableResolve.SEPARABLE_GLOSS;
const keys = Object.keys(gloss);
const withEn = keys.filter((k) => gloss[k].en).length;
const withEs = keys.filter((k) => gloss[k].es).length;
const withFr = keys.filter((k) => gloss[k].fr).length;
const withIt = keys.filter((k) => gloss[k].it).length;

console.log('\n── 1) Local gloss coverage by UI lang ──');
console.log(`  entries=${keys.length}  en=${withEn}  es=${withEs}  fr=${withFr}  it=${withIt}`);
assertEq('has EN for all gloss entries', withEn, keys.length);
assertEq('has ES for all gloss entries', withEs, keys.length);
assertEq('FR curated count matches EN', withFr, keys.length);
assertEq('IT curated count matches EN', withIt, keys.length);

const enHit = SeparableResolve.localGloss('anbieten', 'en', 'de');
const esHit = SeparableResolve.localGloss('anbieten', 'es', 'de');
const frHit = SeparableResolve.localGloss('anbieten', 'fr', 'de');
const itHit = SeparableResolve.localGloss('anbieten', 'it', 'de');
assertEq('EN gloss', enHit?.translation_en, 'to offer');
assertEq('ES gloss', esHit?.translation_es, 'ofrecer');
assertEq('FR gloss', frHit?.translation_fr, 'offrir');
assertEq('IT gloss', itHit?.translation_it, 'offrire');

console.log('\n── 2) Reunify is language-independent ──');
const ctx = 'Das neue Programm bietet kostenlose Kurse in Parks an.';
const r = SeparableResolve.resolveForSave('bietet', ctx);
assertEq('bietet…an → anbieten', r.word, 'anbieten');
assertEq('reunified', r.reunified, true);
assertEq('needsAI false for allowlisted', SeparableResolve.needsAiLemmaFallback(r, ctx, 'de'), false);

console.log('\n── 3) Live FR/IT translation for reunified anbieten ──');
const BASE = process.env.VOCAB_TEST_BASE || 'http://127.0.0.1:8888';
async function translate(word, to, context) {
  const params = new URLSearchParams({ from: 'de', to, text: word });
  if (context) params.set('context', context);
  const res = await fetch(`${BASE}/.netlify/functions/vocab-cache?${params}`);
  const data = await res.json().catch(() => ({}));
  return data;
}

const frAn = await translate('anbieten', 'fr', ctx);
const itAn = await translate('anbieten', 'it', ctx);
console.log('  FR anbieten:', JSON.stringify(frAn));
console.log('  IT anbieten:', JSON.stringify(itAn));
assertOk('FR found', frAn.found && !!frAn.translation);
assertOk('IT found', itAn.found && !!itAn.translation);
assertOk('FR not junk', !isJunkTranslation(frAn.translation));
assertOk('IT not junk', !isJunkTranslation(itAn.translation));
assertOk('FR looks French-ish (offrir/proposer)', /offrir|propos/i.test(frAn.translation));
assertOk('IT looks Italian-ish (offrir/offre/proporre)', /offrir|offre|propor/i.test(itAn.translation));

console.log('\n── 4) AI lemma safety net + FR/IT translation (nachschlagen, not in allowlist) ──');
const ctx2 = 'Er schlägt das Wort im Wörterbuch nach.';
const uncovered = SeparableResolve.resolveForSave('schlägt', ctx2);
assertEq('list does not reunify nachschlagen', uncovered.reunified, false);
assertEq('needs AI lemma', SeparableResolve.needsAiLemmaFallback(uncovered, ctx2, 'de'), true);

const lemmaLive = await resolveSeparableLemma('schlägt', ctx2);
console.log('  AI lemma:', lemmaLive);
assertEq('AI lemma nachschlagen', lemmaLive.lemma, 'nachschlagen');

const frNs = await translate(lemmaLive.lemma || 'nachschlagen', 'fr', ctx2);
const itNs = await translate(lemmaLive.lemma || 'nachschlagen', 'it', ctx2);
console.log('  FR nachschlagen:', JSON.stringify(frNs));
console.log('  IT nachschlagen:', JSON.stringify(itNs));
assertOk('FR nachschlagen found', frNs.found && !!frNs.translation);
assertOk('IT nachschlagen found', itNs.found && !!itNs.translation);
assertOk('FR nachschlagen not junk', !isJunkTranslation(frNs.translation));
assertOk('IT nachschlagen not junk', !isJunkTranslation(itNs.translation));

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
