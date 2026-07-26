/**
 * adsMatching.cambridge-p2.test.mjs
 * Etapa 2 EN: Cambridge B1 Reading Part 2 (person_text_matching) must render the full
 * A-H block of lettered texts pulled from the passage bank, the same way Goethe Lesen
 * T3/T4 does. Before the fix the ads machinery was keyed to German only (teil 3, id
 * pattern "-l-t4-", keys A-F), so EN P2 fell through to the generic items layout and
 * each item showed only the text of its own correct answer.
 *
 * The Goethe path must be untouched: it keeps keys A-F, the "0" escape option and the
 * T3 Beispiel.
 *
 * Run:  node scripts/lib/__tests__/adsMatching.cambridge-p2.test.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const AM = require(path.join(ROOT, 'js/library/adsMatching.js'));

let passed = 0, failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

const toExamQuestion = (q, i) => ({
  id: q.id || `q${i + 1}`,
  type: q.type,
  question: q.question,
  options: q.options,
  correct: q.correct,
});

// ── spec routing ──────────────────────────────────────────────────────────────
assert('EN person_text_matching routes to ads builder',
  AM.isAdsMatchingSpec({ slotType: 'person_text_matching', teil: 2 }) === true);
assert('EN multiple_matching taskFormat routes to ads builder',
  AM.isAdsMatchingSpec({ taskFormat: 'multiple_matching' }) === true);
assert('DE ads_matching still routes (unchanged)',
  AM.isAdsMatchingSpec({ slotType: 'ads_matching' }) === true);
assert('DE teil 3 + matching still routes (unchanged)',
  AM.isAdsMatchingSpec({ teil: 3, questionTypes: ['matching'] }) === true);
assert('unrelated spec does not route',
  AM.isAdsMatchingSpec({ slotType: 'open_cloze', teil: 6 }) === false);

// ── textless options detection ────────────────────────────────────────────────
assert('"a) A" style options are key-only',
  AM.optionsAreKeyOnly(['a) A', 'b) B', 'c) C', 'd) D']) === true);
assert('bare keys still detected',
  AM.optionsAreBareKeys(['a', 'b', 'c', 'd']) === true);
assert('real ad lines are not key-only',
  AM.optionsAreKeyOnly(['a) Riverside Park: walks by the water', 'b) Museum: ancient finds', 'c) Market: crafts']) === false);

// ── id -> passage-set mapping ─────────────────────────────────────────────────
const enSet = AM.passageSetForQuestionId('ql_en-b1-r-t2-match-day-trips-04-q1');
assert('EN P2 id maps to lesen-t2 prefix',
  enSet?.prefix === 'lesen-t2-match-day-trips-04');
assert('EN P2 key range reaches H',
  enSet != null && enSet.keyRe.test('-h') && enSet.keyRe.test('-a'));
const deSet = AM.passageSetForQuestionId('de-b1-l-t4-forum-wohnen-02-q1');
assert('DE T4 id still maps to lesen-t4 prefix (unchanged)',
  deSet?.prefix === 'lesen-t4-forum-wohnen-02');
assert('DE T4 key range stops at F (unchanged)',
  deSet != null && deSet.keyRe.test('-f') && deSet.keyRe.test('-g') === false);

// ── full Cambridge P2 build ───────────────────────────────────────────────────
const AH = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const bank = {
  passages: AH.map((k) => ({
    id: `en-b1-p-lesen-t2-match-day-trips-04-${k}`,
    title: `${k}: Place ${k}`,
    text: `Full descriptive text for option ${k}, long enough to be a real B1 short text.`,
  })),
};
const enQuestions = [1, 2, 3, 4, 5].map((n) => ({
  id: `ql_en-b1-r-t2-match-day-trips-04-q${n}`,
  type: 'matching',
  question: `Person ${n} wants something specific.`,
  options: AH.map((k) => `${k.toLowerCase()}) ${k}`),
  correct: AH[n - 1],
}));

const enPart = AM.buildAdsMatchingLesenPart(
  { teil: 2, slotType: 'person_text_matching', taskFormat: 'multiple_matching', instruction: 'Read the texts.' },
  enQuestions,
  toExamQuestion,
  bank,
);

assert('EN P2 builds 8 lettered texts', enPart.ads.length === 8);
assert('EN P2 keys are A-H in order',
  enPart.ads.map((a) => a.key).join('') === 'ABCDEFGH');
assert('EN P2 ad texts are real texts, not bare letters',
  enPart.ads.every((a) => a.text.length > 20));
assert('EN P2 keeps its own teil (2, not 3)', enPart.teil === 2);
assert('EN P2 keeps its blueprint slot', enPart.blueprintSlot === 'person_text_matching');
assert('EN P2 has no Goethe Beispiel', enPart.example === undefined);
assert('EN P2 offers exactly A-H, no "0" escape',
  enPart.questions[0].options.join('') === 'ABCDEFGH');
assert('EN P2 answer keys normalised', enPart.questions[0].correct === 'A');

// ── single-block storage shape (…-02-01) ──────────────────────────────────────
const blockBank = {
  passages: [{
    id: 'en-b1-p-lesen-t2-match-day-trips-02-01',
    title: 'Day Trip Options',
    text: [
      'A) Riverview Park: A great spot for families with a large playground.',
      'B) Mountain Peak Trail: A challenging hike for experienced walkers.',
      'C) City History Museum: Learn about the town industrial past.',
      'D) Seaside Aquarium: Discover marine life from across the globe.',
      'E) Forest Botanical Gardens: A peaceful escape featuring rare flowers.',
      'F) Old Town Market: Explore local crafts and fresh food stalls.',
      'G) Adventure Sports Center: Try rock climbing or zip-lining.',
      'H) Lakeside Art Gallery: An exhibition of local landscape paintings.',
    ].join('\n'),
  }],
};
const blockQuestions = [1, 2, 3, 4, 5].map((n) => ({
  id: `ql_en-b1-r-t2-match-day-trips-02-q${n}`,
  type: 'matching',
  question: `Person ${n} wants something specific.`,
  options: AH.map((k) => `${k.toLowerCase()}) ${k}`),
  correct: ['E', 'G', 'C', 'A', 'F'][n - 1],
}));
const blockPart = AM.buildAdsMatchingLesenPart(
  { teil: 2, slotType: 'person_text_matching', instruction: 'Read the texts.' },
  blockQuestions,
  toExamQuestion,
  blockBank,
);
assert('single-block set yields 8 ads', blockPart.ads.length === 8);
assert('single-block keys are A-H in order',
  blockPart.ads.map((a) => a.key).join('') === 'ABCDEFGH');
assert('single-block ads carry titles',
  blockPart.ads[0].title === 'Riverview Park');
assert('single-block ads carry real texts',
  blockPart.ads.every((a) => a.text.length > 20));

// ── Goethe T3 regression ──────────────────────────────────────────────────────
const deQuestions = [1, 2, 3].map((n) => ({
  id: `de-b1-l-t3-anzeigen-01-q${n}`,
  type: 'matching',
  question: `Person ${n} sucht etwas.`,
  options: [
    'a) Sprachschule — Wir bieten Kurse fuer alle Niveaus an.',
    'b) Fahrradladen — Reparatur und Verkauf von Fahrraedern.',
    'c) Kochstudio — Gemeinsam kochen am Wochenende.',
  ],
  correct: n === 3 ? 'X' : String.fromCharCode(96 + n),
}));
const dePart = AM.buildAdsMatchingLesenPart(
  { teil: 3, slotType: 'ads_matching', instruction: 'Lesen Sie die Anzeigen.' },
  deQuestions,
  toExamQuestion,
  null,
);
assert('DE T3 builds ads from option lines (unchanged)', dePart.ads.length === 3);
assert('DE T3 keeps the "0" escape option (unchanged)',
  dePart.questions[0].options.includes('0'));
assert('DE T3 maps "X" to "0" (unchanged)', dePart.questions[2].correct === '0');
assert('DE T3 keeps teil 3 (unchanged)', dePart.teil === 3);

console.log(`\nadsMatching cambridge-p2: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
