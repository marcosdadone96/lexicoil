#!/usr/bin/env node
/**
 * test-lesen-instruction-lang.mjs
 * normalizeExam must not stamp the Goethe Lesen T3 ads instruction onto non-German exams.
 *
 * The ads heuristic (isLesenAdsMatchingPart) matches any part whose items are type
 * 'matching', which in Cambridge B1 Reading covers Parts 1-4 — including tasks that are
 * not matching at all. rebuildLesenAdsMatchingInstruction used to overwrite their
 * instruction unconditionally with hardcoded German that also describes the wrong rules
 * ("eine Anzeige passt nicht", "schreiben Sie 0"): Cambridge Part 2 leaves three texts
 * unused and offers no "0" option.
 *
 * German behaviour must be untouched — it still gets the dynamically renumbered wording.
 *
 * Run:  node scripts/test-lesen-instruction-lang.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

globalThis.S = { subject: 'en', level: 'B1', history: [] };
globalThis.window = globalThis;
globalThis.lcDebug = { log() {}, warn() {} };

vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/ui/exam/examGeneration.js'), 'utf8'), {
  filename: 'examGeneration.js',
});

let passed = 0, failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const ads = () =>
  KEYS.map((k) => ({
    key: k,
    title: `Place ${k}`,
    text: `A reasonably long description for option ${k}, long enough to survive filtering.`,
  }));
const items = (start) =>
  Array.from({ length: 5 }, (_, i) => ({
    id: String(start + i),
    type: 'matching',
    question: `Person ${i + 1} is looking for something specific.`,
    correct: KEYS[i],
  }));

const GERMAN = /Lesen Sie|Anzeige|schreiben Sie 0/;

function run(lang, part) {
  const exam = normalizeExam({ level: 'B1', lang, lesenParts: [part] });
  return exam.lesenParts[0].instruction || '';
}

// ── Cambridge: authored instructions must survive ─────────────────────────────
const enP2 = run('en', {
  teil: 2,
  blueprintSlot: 'person_text_matching',
  instruction: 'Read the text(s) and answer the questions in Part 2.',
  ads: ads(),
  items: items(7),
});
assert('EN Part 2 keeps its authored instruction', enP2 === 'Read the text(s) and answer the questions in Part 2.');
assert('EN Part 2 instruction has no German', !GERMAN.test(enP2));

const enP3 = run('en', {
  teil: 3,
  blueprintSlot: 'long_text',
  instruction: 'Read the text(s) and answer the questions in Part 3.',
  ads: ads(),
  items: items(13),
});
assert('EN Part 3 (not a matching task) keeps its instruction', enP3 === 'Read the text(s) and answer the questions in Part 3.');
assert('EN Part 3 instruction has no German', !GERMAN.test(enP3));

// ── Cambridge with nothing authored: synthesized, in English, Cambridge rules ──
const enEmpty = run('en', {
  teil: 2,
  blueprintSlot: 'person_text_matching',
  instruction: '',
  ads: ads(),
  items: items(7),
});
assert('EN with no instruction gets one synthesized', enEmpty.length > 0);
assert('EN synthesized instruction is English', !GERMAN.test(enEmpty));
assert('EN synthesized instruction names the A-H range', /A to H/.test(enEmpty));
assert('EN synthesized instruction offers no "0" option', !/\b0\b/.test(enEmpty));

// ── German: unchanged, still dynamically renumbered ───────────────────────────
const deAuthored = run('de', {
  teil: 3,
  blueprintSlot: 'ads_matching',
  instruction: 'Stale instruction with wrong numbers.',
  ads: ads(),
  items: items(13),
});
assert('DE T3 is still rebuilt over a stale instruction', GERMAN.test(deAuthored));
assert('DE T3 picks up the live item range', /13 bis 17/.test(deAuthored));
assert('DE T3 picks up the live ad range', /a bis h/.test(deAuthored));
assert('DE T3 keeps the "schreiben Sie 0" rule', /schreiben Sie 0/.test(deAuthored));

const deEmpty = run('de', {
  teil: 3,
  blueprintSlot: 'ads_matching',
  instruction: '',
  ads: ads(),
  items: items(13),
});
assert('DE T3 with no instruction still gets the German wording', GERMAN.test(deEmpty));

console.log(`\nlesen instruction lang: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
