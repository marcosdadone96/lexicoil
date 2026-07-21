/**
 * VerbConjugation: Präteritum, Perfekt, Imperativ + separable multi-tense.
 * Run: node scripts/lib/__tests__/verbConjugation.multi-tense.test.mjs
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

function assertOk(desc, cond) {
  if (cond) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    failed++;
  }
}

/** DWDS-verified reference forms for 10 separable test verbs. */
const DWDS_10 = {
  abnehmen: {
    present: { ich: 'nehme ab', er: 'nimmt ab' },
    praeteritum: { ich: 'nahm ab', er: 'nahm ab', du: 'nahmst ab' },
    perfekt: { ich: 'habe abgenommen', er: 'hat abgenommen', partizip: 'abgenommen' },
    imperativ: { du: 'nimm ab!', ihr: 'nehmt ab!', Sie: 'nehmen Sie ab!' },
  },
  vorschlagen: {
    present: { ich: 'schlage vor', er: 'schlägt vor' },
    praeteritum: { ich: 'schlug vor', er: 'schlug vor' },
    perfekt: { ich: 'habe vorgeschlagen', er: 'hat vorgeschlagen', partizip: 'vorgeschlagen' },
    imperativ: { du: 'schlag vor!', ihr: 'schlagt vor!', Sie: 'schlagen Sie vor!' },
  },
  anrufen: {
    present: { ich: 'rufe an', er: 'ruft an' },
    praeteritum: { ich: 'rief an', er: 'rief an' },
    perfekt: { ich: 'habe angerufen', er: 'hat angerufen', partizip: 'angerufen' },
    imperativ: { du: 'ruf an!', ihr: 'ruft an!', Sie: 'rufen Sie an!' },
  },
  anbieten: {
    present: { ich: 'biete an', er: 'bietet an' },
    praeteritum: { ich: 'bot an', er: 'bot an' },
    perfekt: { ich: 'habe angeboten', er: 'hat angeboten', partizip: 'angeboten' },
    imperativ: { du: 'biete an!', ihr: 'bietet an!', Sie: 'bieten Sie an!' },
  },
  mitnehmen: {
    present: { ich: 'nehme mit', er: 'nimmt mit' },
    praeteritum: { ich: 'nahm mit', er: 'nahm mit' },
    perfekt: { ich: 'habe mitgenommen', er: 'hat mitgenommen', partizip: 'mitgenommen' },
    imperativ: { du: 'nimm mit!', ihr: 'nehmt mit!', Sie: 'nehmen Sie mit!' },
  },
  teilnehmen: {
    present: { ich: 'nehme teil', er: 'nimmt teil' },
    praeteritum: { ich: 'nahm teil', er: 'nahm teil' },
    perfekt: { ich: 'habe teilgenommen', er: 'hat teilgenommen', partizip: 'teilgenommen' },
    imperativ: { du: 'nimm teil!', ihr: 'nehmt teil!', Sie: 'nehmen Sie teil!' },
  },
  aufgeben: {
    present: { ich: 'gebe auf', er: 'gibt auf' },
    praeteritum: { ich: 'gab auf', er: 'gab auf' },
    perfekt: { ich: 'habe aufgegeben', er: 'hat aufgegeben', partizip: 'aufgegeben' },
    imperativ: { du: 'gib auf!', ihr: 'gebt auf!', Sie: 'geben Sie auf!' },
  },
  abgeben: {
    present: { ich: 'gebe ab', er: 'gibt ab' },
    praeteritum: { ich: 'gab ab', er: 'gab ab' },
    perfekt: { ich: 'habe abgegeben', er: 'hat abgegeben', partizip: 'abgegeben' },
    imperativ: { du: 'gib ab!', ihr: 'gebt ab!', Sie: 'geben Sie ab!' },
  },
  ausgeben: {
    present: { ich: 'gebe aus', er: 'gibt aus' },
    praeteritum: { ich: 'gab aus', er: 'gab aus' },
    perfekt: { ich: 'habe ausgegeben', er: 'hat ausgegeben', partizip: 'ausgegeben' },
    imperativ: { du: 'gib aus!', ihr: 'gebt aus!', Sie: 'geben Sie aus!' },
  },
  vorlesen: {
    present: { ich: 'lese vor', er: 'liest vor' },
    praeteritum: { ich: 'las vor', er: 'las vor' },
    perfekt: { ich: 'habe vorgelesen', er: 'hat vorgelesen', partizip: 'vorgelesen' },
    imperativ: { du: 'lies vor!', ihr: 'lest vor!', Sie: 'lesen Sie vor!' },
  },
};

console.log('\n── 10 DWDS verbs × 4 tenses ──');
for (const [verb, ref] of Object.entries(DWDS_10)) {
  for (const tense of ['present', 'praeteritum', 'perfekt', 'imperativ']) {
    const c = VerbConjugation.getConjugation(verb, 'de', tense);
    assertOk(`${verb} ${tense} conjugates`, !!c?.forms);
    assertOk(`${verb} ${tense} separable`, c?.separable === true);
    for (const [pers, form] of Object.entries(ref[tense])) {
      if (pers === 'partizip') {
        assertEq(`${verb} ${tense} partizip`, c?.partizip, form);
      } else {
        assertEq(`${verb} ${tense} ${pers}`, c?.forms?.[pers], form);
      }
    }
  }
}

console.log('\n── Präteritum: prefix at clause end (not glued) ──');
{
  const c = VerbConjugation.getPraeteritum('vorschlagen', 'de');
  assertEq('prät ich schlug vor', c?.forms?.ich, 'schlug vor');
  assertOk('prät ich not vorschlug', c?.forms?.ich !== 'vorschlug');
}

console.log('\n── Perfekt: ge- interleaved in separables (not *geschlagen vor) ──');
{
  const c = VerbConjugation.getPerfekt('vorschlagen', 'de');
  assertEq('perf partizip', c?.partizip, 'vorgeschlagen');
  assertOk('no trailing vor participle', !c?.partizip?.includes('schlagen vor'));
  assertEq('perf ich', c?.forms?.ich, 'habe vorgeschlagen');
}

console.log('\n── Imperativ: prefix at end (Ruf an! not Anruf!) ──');
{
  const c = VerbConjugation.getImperativ('anrufen', 'de');
  assertEq('imp du', c?.forms?.du, 'ruf an!');
  assertOk('imp du not anruf', c?.forms?.du !== 'anruf!');
}

console.log('\n── UI HTML: tense tabs, no overlay select ──');
{
  globalThis.esc = (s) => String(s ?? '');
  const html = VerbConjugation.conjugationSelectHtml(
    { word: 'abnehmen', type: 'verb', sourceLang: 'de' },
    { subject: 'de' },
    't1',
  );
  assertOk('has tense tabs', html.includes('vv-conj-tense-tab'));
  assertOk('has Präteritum tab', html.includes('Präteritum'));
  assertOk('has Perfekt tab', html.includes('Perfekt'));
  assertOk('has Imperativ tab', html.includes('Imperativ'));
  assertOk('no select overlay', !html.includes('<select'));
  assertOk('present panel active by default', html.includes('vv-conj-tense-panel--active'));
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
process.exit(failed ? 1 : 0);
