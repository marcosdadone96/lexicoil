/**
 * Separable-verb phrase gate + gap template (Option B).
 * Run: node scripts/lib/__tests__/vocabPhrasesUtils.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

global.Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
global.SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));

const VP = require(path.join(ROOT, 'netlify/functions/lib/vocabPhrasesUtils.js'));
const { pickPhraseGapOptions } = require(path.join(ROOT, 'netlify/functions/lib/vocabQuizUtils.js'));
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

const FIVE_VERBS = ['vorschlagen', 'abnehmen', 'aufstehen', 'anrufen', 'untergehen'];

console.log('\n── Allowlist: untergehen added (DWDS: geht unter, unter- gehen) ──');
assertOk('untergehen in allowlist', SeparableResolve.SEPARABLE_INFINITIVES.has('untergehen'));

console.log('\n── Gate accepts split phrases, rejects glued ──');
const GOOD = [
  {
    target: 'abnehmen',
    full: 'Die Sonne nimmt am Abend ab.',
    blank: 'nimmt',
    root: 'nimmt',
    particle: 'ab',
  },
  {
    target: 'vorschlagen',
    full: 'Er schlägt einen Spaziergang vor.',
    blank: 'schlägt',
    root: 'schlägt',
    particle: 'vor',
  },
  {
    target: 'aufstehen',
    full: 'Ich stehe jeden Morgen um sieben auf.',
    blank: 'stehe',
    root: 'stehe',
    particle: 'auf',
  },
  {
    target: 'anrufen',
    full: 'Sie ruft ihre Mutter nach der Arbeit an.',
    blank: 'ruft',
    root: 'ruft',
    particle: 'an',
  },
  {
    target: 'untergehen',
    full: 'Die Sonne geht am Horizont unter.',
    blank: 'geht',
    root: 'geht',
    particle: 'unter',
  },
];

for (const g of GOOD) {
  const gate = VP.validateSeparablePhrase(g.target, g.full, g.blank);
  assertOk(`${g.target} split passes gate`, gate.ok);
  const norm = VP.normalizeSeparablePhraseItem({
    targetWord: g.target,
    full: g.full,
    blankToken: g.blank,
    blankPos: 'verb',
    tokens: SeparableResolve.tokenize(g.full),
  });
  assertOk(`${g.target} normalizes`, norm.ok);
  assertEq(`${g.target} blankToken is root`, norm.phrase.blankToken.toLowerCase(), g.blank.toLowerCase());
  assertOk(`${g.target} display keeps particle`, norm.phrase.display.includes('_____') && norm.phrase.full.includes(g.particle));
  assertOk(`${g.target} tokens include particle`, norm.phrase.tokens.some((t) => t.toLowerCase().startsWith(g.particle)));
  assertEq(
    `${g.target} order tokens join`,
    norm.phrase.tokens.join(' ').replace(/\s+/g, ' ').trim(),
    SeparableResolve.tokenize(g.full).join(' ').replace(/\s+/g, ' ').trim(),
  );
}

const GLUED = [
  { target: 'abnehmen', full: 'Die Sonne abnimmt am Abend.', blank: 'abnimmt', reason: 'no_split_pair' },
  { target: 'untergehen', full: 'Die Sonne untergeht am Horizont.', blank: 'untergeht', reason: 'no_split_pair' },
  { target: 'anrufen', full: 'Sie anruft ihre Mutter nach der Arbeit.', blank: 'anruft', reason: 'no_split_pair' },
];

for (const bad of GLUED) {
  const gate = VP.validateSeparablePhrase(bad.target, bad.full, bad.blank);
  assertOk(`${bad.target} glued rejected (${bad.reason})`, !gate.ok);
  const norm = VP.normalizeSeparablePhraseItem({
    targetWord: bad.target,
    full: bad.full,
    blankToken: bad.blank,
    tokens: SeparableResolve.tokenize(bad.full),
  });
  assertOk(`${bad.target} glued normalize fails`, !norm.ok);
}

console.log('\n── Forced glued case: gate blocks before accept ──');
{
  const gluedItem = {
    targetWord: 'vorschlagen',
    full: 'Er schlägt einen Spaziergang vor.',
    blankToken: 'vorschlägt',
    tokens: ['Er', 'schlägt', 'einen', 'Spaziergang', 'vor.'],
  };
  const wrongBlank = VP.validateSeparablePhrase(gluedItem.targetWord, gluedItem.full, 'vorschlagen');
  assertOk('lemma as blank rejected', !wrongBlank.ok);
  const gluedFull = {
    targetWord: 'aufstehen',
    full: 'Ich stehe um sieben aufstehe.',
    blankToken: 'aufstehe',
    tokens: SeparableResolve.tokenize('Ich stehe um sieben aufstehe.'),
  };
  assertOk('malformed glued full fails', !VP.normalizeSeparablePhraseItem(gluedFull).ok);
}

console.log('\n── Gap distractors: conjugated stems, not lemmas ──');
const verbMeta = FIVE_VERBS.map((w) => ({ word: w, type: 'verb', translation: w }));
const abOpts = pickPhraseGapOptions('nimmt', 'abnehmen', verbMeta, () => 0.5);
assertOk('abnehmen gap includes nimmt', abOpts.some((o) => o.toLowerCase() === 'nimmt'));
assertOk('abnehmen gap no lemma distractors', !abOpts.some((o) => o.toLowerCase() === 'abnehmen'));
assertOk('abnehmen gap no glued stems', !abOpts.some((o) => /^ab[a-zäöüß]/i.test(o)));

const ugOpts = pickPhraseGapOptions('geht', 'untergehen', verbMeta, () => 0.5);
assertOk('untergehen gap includes geht', ugOpts.some((o) => o.toLowerCase() === 'geht'));
assertOk('untergehen gap no untergehen lemma', !ugOpts.some((o) => o.toLowerCase() === 'untergehen'));

console.log('\n── Present stems for 5 verbs ──');
for (const v of FIVE_VERBS) {
  const c = VerbConjugation.getPresent(v, 'de');
  assertOk(`${v} separable`, c?.separable === true);
  const er = String(c?.forms?.er || '');
  assertOk(`${v} er form has space (split)`, er.includes(' '));
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
process.exit(failed ? 1 : 0);
