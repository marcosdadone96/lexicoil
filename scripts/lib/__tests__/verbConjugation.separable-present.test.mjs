/**
 * VerbConjugation: Lemmatizer-unified lemma + separable present forms.
 * Run: node scripts/lib/__tests__/verbConjugation.separable-present.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Load order matches index.html: Lemmatizer → SeparableResolve → VerbConjugation
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

function assertOk(desc, cond) {
  if (cond) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    failed++;
  }
}

console.log('\n── Separable prefixes exported ──');
assertOk(
  'SEPARABLE_PREFIXES exported',
  Array.isArray(SeparableResolve.SEPARABLE_PREFIXES) &&
    SeparableResolve.SEPARABLE_PREFIXES.includes('vor'),
);
assertOk('vorschlagen allowlisted', SeparableResolve.SEPARABLE_INFINITIVES.has('vorschlagen'));

console.log('\n── toLemma always via Lemmatizer (infinitives + finites) ──');
assertEq('trinken → trinken', VerbConjugation.toLemma('trinken', 'de'), 'trinken');
assertEq('Trinkt → trinken', VerbConjugation.toLemma('Trinkt', 'de'), 'trinken');
assertEq('vorschlagen → vorschlagen', VerbConjugation.toLemma('vorschlagen', 'de'), 'vorschlagen');
assertEq('sein → sein (not sei)', VerbConjugation.toLemma('sein', 'de'), 'sein');
assertEq('ist → sein', VerbConjugation.toLemma('ist', 'de'), 'sein');
assertOk('aufstehen allowlisted', SeparableResolve.SEPARABLE_INFINITIVES.has('aufstehen'));

console.log('\n── Broken separables (present split + ablaut) ──');
{
  const c = VerbConjugation.getPresent('vorschlagen', 'de');
  assertEq('vorschlagen lemma', c?.lemma, 'vorschlagen');
  assertOk('vorschlagen marked separable', c?.separable === true);
  assertEq('ich schlage vor', c?.forms?.ich, 'schlage vor');
  assertEq('du schlägst vor', c?.forms?.du, 'schlägst vor');
  assertEq('er schlägt vor', c?.forms?.er, 'schlägt vor');
  assertEq('wir vorschlagen (inf as wir)', c?.forms?.wir, 'schlagen vor');
  assertOk('no solid ich vorschlage', c?.forms?.ich !== 'vorschlage');
}
{
  const c = VerbConjugation.getPresent('anrufen', 'de');
  assertEq('anrufen ich', c?.forms?.ich, 'rufe an');
  assertEq('anrufen er', c?.forms?.er, 'ruft an');
  assertEq('anrufen wir', c?.forms?.wir, 'rufen an');
}
{
  const c = VerbConjugation.getPresent('aufstehen', 'de');
  assertEq('aufstehen ich', c?.forms?.ich, 'stehe auf');
  assertEq('aufstehen du', c?.forms?.du, 'stehst auf');
  assertEq('aufstehen er', c?.forms?.er, 'steht auf');
}
{
  const c = VerbConjugation.getPresent('anbieten', 'de');
  assertEq('anbieten ich', c?.forms?.ich, 'biete an');
  assertEq('anbieten er', c?.forms?.er, 'bietet an');
  assertEq('anbieten wir', c?.forms?.wir, 'bieten an');
}

console.log('\n── Separable irregular e→i / ablaut from finite surface ──');
const ABNEHMEN = {
  ich: 'nehme ab', du: 'nimmst ab', er: 'nimmt ab', wir: 'nehmen ab', ihr: 'nehmt ab', sie: 'nehmen ab',
};
assertEq('abnimmt → abnehmen lemma', VerbConjugation.toLemma('abnimmt', 'de'), 'abnehmen');
assertEq('aufgibt → aufgeben lemma', VerbConjugation.toLemma('aufgibt', 'de'), 'aufgeben');
assertEq('vorliest → vorlesen lemma', VerbConjugation.toLemma('vorliest', 'de'), 'vorlesen');
assertEq('vorschlägt → vorschlagen lemma', VerbConjugation.toLemma('vorschlägt', 'de'), 'vorschlagen');
for (const [inf, expected] of Object.entries({
  abnehmen: ABNEHMEN,
  abnimmt: ABNEHMEN,
  abnimmst: ABNEHMEN,
  mitnehmen: {
    ich: 'nehme mit', du: 'nimmst mit', er: 'nimmt mit', wir: 'nehmen mit', ihr: 'nehmt mit', sie: 'nehmen mit',
  },
  mitnimmst: {
    ich: 'nehme mit', du: 'nimmst mit', er: 'nimmt mit', wir: 'nehmen mit', ihr: 'nehmt mit', sie: 'nehmen mit',
  },
  teilnehmen: {
    ich: 'nehme teil', du: 'nimmst teil', er: 'nimmt teil', wir: 'nehmen teil', ihr: 'nehmt teil', sie: 'nehmen teil',
  },
  aufgeben: {
    ich: 'gebe auf', du: 'gibst auf', er: 'gibt auf', wir: 'geben auf', ihr: 'gebt auf', sie: 'geben auf',
  },
  aufgibt: {
    ich: 'gebe auf', du: 'gibst auf', er: 'gibt auf', wir: 'geben auf', ihr: 'gebt auf', sie: 'geben auf',
  },
  vorlesen: {
    ich: 'lese vor', du: 'liest vor', er: 'liest vor', wir: 'lesen vor', ihr: 'lest vor', sie: 'lesen vor',
  },
  vorliest: {
    ich: 'lese vor', du: 'liest vor', er: 'liest vor', wir: 'lesen vor', ihr: 'lest vor', sie: 'lesen vor',
  },
  abgeben: {
    ich: 'gebe ab', du: 'gibst ab', er: 'gibt ab', wir: 'geben ab', ihr: 'gebt ab', sie: 'geben ab',
  },
  ausgeben: {
    ich: 'gebe aus', du: 'gibst aus', er: 'gibt aus', wir: 'geben aus', ihr: 'gebt aus', sie: 'geben aus',
  },
  ausgibt: {
    ich: 'gebe aus', du: 'gibst aus', er: 'gibt aus', wir: 'geben aus', ihr: 'gebt aus', sie: 'geben aus',
  },
  vorschlägt: {
    ich: 'schlage vor', du: 'schlägst vor', er: 'schlägt vor', wir: 'schlagen vor', ihr: 'schlagt vor', sie: 'schlagen vor',
  },
})) {
  const c = VerbConjugation.getPresent(inf, 'de');
  assertOk(`${inf} separable`, c?.separable === true);
  for (const [pers, form] of Object.entries(expected)) {
    assertEq(`${inf} ${pers}`, c?.forms?.[pers], form);
  }
}

console.log('\n── Non-separable regression (exact prior DE_PRESENT forms) ──');
const REGRESSION = {
  trinken: { ich: 'trinke', du: 'trinkst', er: 'trinkt', wir: 'trinken', ihr: 'trinkt', sie: 'trinken' },
  arbeiten: { ich: 'arbeite', du: 'arbeitest', er: 'arbeitet', wir: 'arbeiten', ihr: 'arbeitet', sie: 'arbeiten' },
  nehmen: { ich: 'nehme', du: 'nimmst', er: 'nimmt', wir: 'nehmen', ihr: 'nehmt', sie: 'nehmen' },
  geben: { ich: 'gebe', du: 'gibst', er: 'gibt', wir: 'geben', ihr: 'gebt', sie: 'geben' },
  sein: { ich: 'bin', du: 'bist', er: 'ist', wir: 'sind', ihr: 'seid', sie: 'sind' },
  können: { ich: 'kann', du: 'kannst', er: 'kann', wir: 'können', ihr: 'könnt', sie: 'können' },
  fahren: { ich: 'fahre', du: 'fährst', er: 'fährt', wir: 'fahren', ihr: 'fahrt', sie: 'fahren' },
};
for (const [inf, expected] of Object.entries(REGRESSION)) {
  const c = VerbConjugation.getPresent(inf, 'de');
  assertOk(`${inf} not marked separable`, !c?.separable);
  for (const [pers, form] of Object.entries(expected)) {
    assertEq(`${inf} ${pers}`, c?.forms?.[pers], form);
  }
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
process.exit(failed ? 1 : 0);
