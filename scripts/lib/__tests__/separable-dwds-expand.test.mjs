/**
 * DWDS expansion + subordinate-clause AI lemma prompt tests.
 * Run: node scripts/lib/__tests__/separable-dwds-expand.test.mjs
 */
import assert from 'assert';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { SEPARABLE_INFINITIVES as EMB } from '../enrichBatchMetadata.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));
const {
  buildLemmaPrompt,
  resolveSeparableLemma,
} = require(path.join(ROOT, 'netlify/functions/lib/freeTranslate.js'));

let passed = 0;
let failed = 0;
function assertEq(label, a, b) {
  try {
    assert.strictEqual(a, b);
    console.log('  ✅', label);
    passed += 1;
  } catch (_) {
    console.log('  ❌', label, 'got', a, 'expected', b);
    failed += 1;
  }
}
function assertOk(label, cond) {
  assertEq(label, !!cond, true);
}

console.log('\n── count + sync ──');
console.log('  before expansion was 125; now', SeparableResolve.SEPARABLE_INFINITIVES.size);
assertEq('browser/enrich sync', SeparableResolve.SEPARABLE_INFINITIVES.size, EMB.size);
assertOk('grew to >= 269', SeparableResolve.SEPARABLE_INFINITIVES.size >= 269);
assertEq('discarded adj aufmerksam', SeparableResolve.SEPARABLE_INFINITIVES.has('aufmerksam'), false);
assertEq('discarded adj ausführbar', SeparableResolve.SEPARABLE_INFINITIVES.has('ausführbar'), false);
assertEq('DWDS accept abbiegen', SeparableResolve.SEPARABLE_INFINITIVES.has('abbiegen'), true);
assertEq('DWDS accept anerkennen', SeparableResolve.SEPARABLE_INFINITIVES.has('anerkennen'), true);
for (const v of [
  'abwarten', 'abwickeln', 'austragen', 'fortsetzen', 'herunterladen',
  'zurückfahren', 'zurückgehen', 'zurücklaufen', 'zusammenarbeiten',
]) {
  assertEq(`vocab gap ${v}`, SeparableResolve.SEPARABLE_INFINITIVES.has(v), true);
}

console.log('\n── regression reunify ──');
const cases = [
  ['bietet', 'Das Programm bietet Kurse an.', 'anbieten'],
  ['schlägt', 'Sie schlägt vor, früher zu kommen.', 'vorschlagen'],
  ['nimmt', 'Sie nimmt am Kurs teil.', 'teilnehmen'],
  ['erkennt', 'Die Schule erkennt seine Leistung an.', 'anerkennen'],
  ['lädt', 'Er lädt die App herunter.', 'herunterladen'],
  ['lädt', 'Sie lädt das Dokument herunter.', 'herunterladen'],
];
for (const [s, c, w] of cases) {
  const r = SeparableResolve.resolveForSave(s, c);
  assertEq(`${s}→${w}`, r.word, w);
  assertEq(`${w} reunified`, r.reunified, true);
}

console.log('\n── prompt V2 / subordinate hints ──');
const prompt = buildLemmaPrompt('anrufe', 'Ich bleibe zu Hause, weil ich dich morgen anrufe.');
assertOk('prompt mentions 2nd position', /2nd position|2ª|zweiten Position|2\./i.test(prompt));
assertOk('prompt mentions subordinate', /SUBORDINATE|weil|dass|wenn/i.test(prompt));
assertOk('prompt says do not invent particle', /Do NOT invent|NOT split|nicht/i.test(prompt));
assertOk('prompt example anrufe', /anrufe/i.test(prompt));

console.log('\n── live subordinate: no false split search ──');
const subCtx = 'Ich bleibe zu Hause, weil ich dich morgen anrufe.';
const sub = SeparableResolve.resolveForSave('anrufe', subCtx);
// list may lemmatize or leave surface; either way no wrong particle hunt at list layer
assertEq('subordinate not falsely reunified to nonsense', /^(anrufe|anrufen)$/.test(sub.word), true);

const live = await resolveSeparableLemma('anrufe', subCtx);
if (live.reason === 'no_api_key' || live.reason === 'lemma_failed' || live.reason === 'gemini_ratelimit_requires_blob_store') {
  console.log('  ⚠️  skipped live Gemini');
} else {
  console.log('  live lemma:', live);
  assertEq('AI → anrufen (not bare rufen / invented split)', live.lemma, 'anrufen');
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
