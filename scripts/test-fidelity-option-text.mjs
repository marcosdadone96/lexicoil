#!/usr/bin/env node
/**
 * A lettered pool must give the candidate something to choose between.
 *
 * Two Cambridge Reading Part 4 passages reached a published en/B1 exam with options
 * ["a) A", ..., "h) H"] — the eight candidate sentences were never generated, so the task
 * could not be answered. Every count-based check passed it: there were exactly eight
 * options. This locks the shape check that catches it, and the exemption for the shapes
 * whose real pool lives in ads[] (Goethe Lesen T3, Cambridge Reading P2).
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { validatePartSemanticRules } = require(
  path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'),
);

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL', label);
    process.exit(1);
  }
  console.log('OK  ', label);
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const placeholders = LETTERS.map((k) => `${k.toLowerCase()}) ${k}`);
const realSentences = LETTERS.map((k) => `${k}) A full candidate sentence for slot ${k}.`);

const gappedPart = (options) => ({
  teil: 4,
  blueprintSlot: 'gapped_text',
  text: 'A passage with (1) ____ and (2) ____ gaps.',
  questions: [1, 2].map((n) => ({
    id: `q${n}`,
    type: 'matching',
    question: `Choose the best sentence for gap ${n}.`,
    options,
    correct: LETTERS[n],
  })),
});

const bpPart = { teil: 4, slotType: 'gapped_text', questionTypes: ['matching'] };

const broken = validatePartSemanticRules(gappedPart(placeholders), bpPart, 'lesen', 4, 'B1');
const brokenHits = broken.errors.filter((e) => e.startsWith('options_without_text:'));
assert('placeholder options are flagged', brokenHits.length === 2);
assert(
  'the flag names the offending question',
  brokenHits.every((e) => /id=q[12]/.test(e)) && brokenHits.some((e) => /options=8/.test(e)),
);

const healthy = validatePartSemanticRules(gappedPart(realSentences), bpPart, 'lesen', 4, 'B1');
assert(
  'real sentences pass',
  healthy.errors.filter((e) => e.startsWith('options_without_text:')).length === 0,
);

// Goethe Lesen T3 / Cambridge Reading P2: the pool is ads[], and the per-item options are
// legitimately key stubs. A real ads[] must clear the part.
const adsBacked = {
  teil: 3,
  blueprintSlot: 'ads_matching',
  ads: LETTERS.slice(0, 4).map((k) => ({ key: k, title: `Anzeige ${k}`, text: `Ein Text zu ${k}.` })),
  questions: [1, 2].map((n) => ({
    id: `s${n}`,
    type: 'matching',
    question: `Situation ${n}.`,
    options: placeholders,
    correct: LETTERS[n],
  })),
};
const adsResult = validatePartSemanticRules(
  adsBacked,
  { teil: 3, slotType: 'ads_matching', questionTypes: ['matching'] },
  'lesen',
  3,
  'B1',
);
assert(
  'a real ads pool exempts its key-stub options',
  adsResult.errors.filter((e) => e.startsWith('options_without_text:')).length === 0,
);

// An ads[] that is itself empty must NOT exempt anything.
const emptyAds = { ...adsBacked, ads: LETTERS.slice(0, 4).map((k) => ({ key: k, title: '', text: '' })) };
const emptyAdsResult = validatePartSemanticRules(
  emptyAds,
  { teil: 3, slotType: 'ads_matching', questionTypes: ['matching'] },
  'lesen',
  3,
  'B1',
);
assert(
  'an empty ads pool does not exempt',
  emptyAdsResult.errors.filter((e) => e.startsWith('options_without_text:')).length === 2,
);

// Ordinary 3-option MCQ with real text is untouched.
const mcq = validatePartSemanticRules(
  {
    teil: 1,
    blueprintSlot: 'signs_notices_mcq',
    items: [{ id: 'i1', question: 'What does it say?', options: ['a) One', 'b) Two', 'c) Three'], correct: 'a' }],
  },
  { teil: 1, slotType: 'signs_notices_mcq', questionTypes: ['multiple_choice'] },
  'lesen',
  1,
  'B1',
);
assert(
  'normal MCQ options are untouched',
  mcq.errors.filter((e) => e.startsWith('options_without_text:')).length === 0,
);

console.log('\nFidelity option-text tests passed.');
