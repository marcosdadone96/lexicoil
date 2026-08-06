/**
 * Flashcard bidirectional practice: faces, TTS lang, shared SRS.
 * Run: node scripts/lib/__tests__/fcReverse.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

let passed = 0;
let failed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅  ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${desc}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const g = {
  S: {
    fcReverse: false,
    fcLang: 'en',
    subject: 'de',
    flashcards: [],
  },
  esc,
  LANGS: [{ code: 'en', l: 'EN' }],
  VOCAB_UI_LANG_CODES: ['en'],
  vocabUiLangs: () => [{ code: 'en', l: 'EN' }],
  resolveVocabUiLang: () => 'en',
  normWordType: (t) => String(t || 'other').toLowerCase(),
  typeBadge: () => '',
  fcWordDisplayHtml: (fc) => {
    if (fc.article && fc.gender === 'm') {
      return '<span class="fc-word-line"><span class="vv-art art-masc">der</span><span>' + fc.word + '</span></span>';
    }
    return String(fc.word || '');
  },
  fcSpeakPhrase: (fc) => (fc.article ? fc.article + ' ' : '') + (fc.word || ''),
  saveFC: () => {},
  console,
};
g.window = g;
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/vocabulary/flashcards.js'), 'utf8'), g);

const { fcCardFaces, fcTtsLangForCode, getSRS, srsRate, fcDirectionBarHtml } = g;

const noun = {
  id: 'fc_n1',
  word: 'Tisch',
  article: 'der',
  gender: 'm',
  type: 'noun',
  sourceLang: 'de',
  translations: { en: 'table' },
  interval: 3,
  ef: 2.5,
  nextReview: 1000,
};

const verb = {
  id: 'fc_v1',
  word: 'gehen',
  type: 'verb',
  sourceLang: 'de',
  translations: { en: 'to go' },
  interval: 1,
  ef: 2.4,
  nextReview: 2000,
};

console.log('\n── DE→EN (default) ──');

test('noun DE→EN: front = der Tisch, back = table, TTS de-DE on front', () => {
  g.S.fcReverse = false;
  const f = fcCardFaces(noun, 'de');
  assert.match(f.front.html, /Tisch/);
  assert.match(f.front.html, /der/);
  assert.equal(f.front.speak, 'der Tisch');
  assert.equal(f.front.ttsLang, 'de-DE');
  assert.equal(f.back.html, 'table');
  assert.equal(f.back.speak, 'table');
  assert.equal(f.back.ttsLang, 'en-GB');
});

test('verb DE→EN: front = gehen, back = to go', () => {
  g.S.fcReverse = false;
  const f = fcCardFaces(verb, 'de');
  assert.equal(f.front.speak, 'gehen');
  assert.equal(f.front.ttsLang, 'de-DE');
  assert.equal(f.back.speak, 'to go');
  assert.equal(f.back.ttsLang, 'en-GB');
});

console.log('\n── EN→DE (reverse) ──');

test('noun EN→DE: front = table (en-GB), back = der Tisch (de-DE)', () => {
  g.S.fcReverse = true;
  const f = fcCardFaces(noun, 'de');
  assert.equal(f.front.speak, 'table');
  assert.equal(f.front.ttsLang, 'en-GB');
  assert.equal(f.back.speak, 'der Tisch');
  assert.equal(f.back.ttsLang, 'de-DE');
});

test('verb EN→DE: front = to go, back = gehen', () => {
  g.S.fcReverse = true;
  const f = fcCardFaces(verb, 'de');
  assert.equal(f.front.speak, 'to go');
  assert.equal(f.front.ttsLang, 'en-GB');
  assert.equal(f.back.speak, 'gehen');
  assert.equal(f.back.ttsLang, 'de-DE');
});

console.log('\n── SRS shared (same fc object, direction agnostic) ──');

test('srsRate updates same card fields regardless of fcReverse', () => {
  g.S.flashcards = [{ ...noun }];
  g.S.fcReverse = true;
  srsRate(0, 3);
  const afterReverse = { interval: g.S.flashcards[0].interval, ef: g.S.flashcards[0].ef, nextReview: g.S.flashcards[0].nextReview };
  g.S.fcReverse = false;
  assert.ok(afterReverse.interval > 3);
  assert.ok(afterReverse.ef >= 2.5);
  assert.ok(afterReverse.nextReview > Date.now());
  const before = { ...afterReverse };
  srsRate(0, 0);
  assert.equal(g.S.flashcards[0].interval, 1);
  assert.notDeepEqual(g.S.flashcards[0].nextReview, before.nextReview);
});

test('direction toggle HTML exposes DE→EN / EN→DE', () => {
  g.S.fcReverse = false;
  const bar = fcDirectionBarHtml('de');
  assert.match(bar, /DE→EN/);
  assert.match(bar, /EN→DE/);
  assert.match(bar, /setFcReverse\(false/);
  assert.match(bar, /setFcReverse\(true/);
});

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
