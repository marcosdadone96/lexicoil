/**
 * Separable allowlist expansion + AI lemma fallback gates.
 * Run: node scripts/lib/__tests__/separable-ai-lemma.test.mjs
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
  cleanLemma,
  isJunkTranslation,
  resolveSeparableLemma,
  maybeReuniteParticle,
  buildLemmaPrompt,
} = require(path.join(ROOT, 'netlify/functions/lib/freeTranslate.js'));

let passed = 0;
let failed = 0;
function assertEq(label, a, b) {
  try {
    assert.strictEqual(a, b);
    console.log('  ✅ ', label);
    passed += 1;
  } catch (e) {
    console.log('  ❌ ', label, 'got', a, 'expected', b);
    failed += 1;
  }
}
function assertOk(label, cond) {
  assertEq(label, !!cond, true);
}

console.log('\n── allowlist sync + expansion ──');
assertEq('browser/enrich counts match', SeparableResolve.SEPARABLE_INFINITIVES.size, EMB.size);
assertOk('allowlist grew past 83', SeparableResolve.SEPARABLE_INFINITIVES.size > 83);
console.log('  count=', SeparableResolve.SEPARABLE_INFINITIVES.size);

const newOnes = [
  'austauschen', 'ansprechen', 'angeben', 'ablehnen', 'zustimmen', 'mithelfen',
  'ausgehen', 'zunehmen', 'abstellen', 'zusammenfassen', 'überweisen', 'umsteigen',
];
for (const w of newOnes) {
  assertOk(`has ${w}`, SeparableResolve.SEPARABLE_INFINITIVES.has(w));
}

console.log('\n── reunify new pool-backed verbs ──');
const cases = [
  ['tauscht', 'Wir tauschen Ideen aus.', 'austauschen'],
  ['spricht', 'Der Nachbar spricht Herrn Lehmann an.', 'ansprechen'],
  ['gibt', 'Die Durchsage gibt an, dass der Kurs beginnt.', 'angeben'],
  ['lehnen', 'Ihre Angehörigen lehnen den Vorschlag ab.', 'ablehnen'],
  ['stimmen', 'Beide Gäste stimmen am Ende zu.', 'zustimmen'],
  ['hilft', 'Die Nachbarn hilft oft mit.', 'mithelfen'],
  ['geht', 'Am Wochenende geht sie gerne aus.', 'ausgehen'],
  ['nimmt', 'Er nimmt stark zu.', 'zunehmen'],
  ['stellt', 'Bitte stellt den Motor ab.', 'abstellen'],
  ['fasst', 'Bitte fasst den Text zusammen.', 'zusammenfassen'],
];
for (const [surface, ctx, want] of cases) {
  const r = SeparableResolve.resolveForSave(surface, ctx);
  assertEq(`${surface}→${want}`, r.word, want);
  assertEq(`${want} reunified`, r.reunified, true);
}

console.log('\n── AI fallback gate (no spend) ──');
const covered = SeparableResolve.resolveForSave(
  'bietet',
  'Das Programm bietet Kurse in Parks an.',
);
assertEq('anbieten reunified', covered.word, 'anbieten');
assertEq(
  'allowlisted does NOT need AI',
  SeparableResolve.needsAiLemmaFallback(covered, 'Das Programm bietet Kurse in Parks an.', 'de'),
  false,
);

const uncovered = SeparableResolve.resolveForSave(
  'schlägt',
  'Er schlägt das Wort im Wörterbuch nach.',
);
assertEq('nachschlagen NOT in allowlist', SeparableResolve.SEPARABLE_INFINITIVES.has('nachschlagen'), false);
assertEq('schlägt…nach not reunified by list', uncovered.reunified, false);
assertEq(
  'uncovered DOES need AI',
  SeparableResolve.needsAiLemmaFallback(uncovered, 'Er schlägt das Wort im Wörterbuch nach.', 'de'),
  true,
);
assertEq(
  'no context → no AI',
  SeparableResolve.needsAiLemmaFallback(uncovered, '', 'de'),
  false,
);

console.log('\n── lemma clean / junk ──');
assertEq('cleanLemma nachschlagen', cleanLemma('nachschlagen'), 'nachschlagen');
assertEq('cleanLemma strips junk URL', cleanLemma('https://fivestar-marketing.net/x'), '');
assertEq(
  'maybeReunite schlagen+nach',
  maybeReuniteParticle('schlagen', 'schlägt', 'Er schlägt das Wort im Wörterbuch nach.'),
  'nachschlagen',
);
assertOk('isJunk URL', isJunkTranslation('https://evil.example/spam'));
assertOk('prompt mentions separable', /separable|trennbar|anbieten|nachschlagen/i.test(buildLemmaPrompt('schlägt', 'Er schlägt nach.')));

console.log('\n── live AI lemma (nachschlagen — not in allowlist) ──');
const live = await resolveSeparableLemma('schlägt', 'Er schlägt das Wort im Wörterbuch nach.');
if (live.reason === 'no_api_key') {
  console.log('  ⚠️  skipped live Gemini (no API key)');
} else {
  console.log('  live result:', live);
  assertOk('live found lemma', !!live.lemma);
  assertEq('live → nachschlagen', live.lemma, 'nachschlagen');
  assertOk('live not junk', !isJunkTranslation(live.lemma));
}

// Confirm allowlisted path would not call resolveSeparableLemma (gate only)
let aiCalls = 0;
const origNeed = SeparableResolve.needsAiLemmaFallback;
assertEq('gate blocks anbieten before any AI', origNeed(covered, 'Das Programm bietet Kurse an.', 'de'), false);
aiCalls += origNeed(covered, 'Das Programm bietet Kurse an.', 'de') ? 1 : 0;
assertEq('AI call counter stayed 0 for allowlisted', aiCalls, 0);

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
