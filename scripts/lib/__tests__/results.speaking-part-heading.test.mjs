/**
 * results.speaking-part-heading.test.mjs
 *
 * Regression, found doing QA on production (22 aug 2026) — the heading read:
 *
 *     Speaking — Teil 1 · undefined%
 *
 * Two defects on one line (renderCorrectionHtml, results.js):
 *
 *  a) "Teil" was hardcoded while the module name switched on isDE, so English and Spanish
 *     results showed a German word. Every neighbour in that block was already switched
 *     (Schreiben/Writing, Checkliste/Checklist, Musterdialog/Model dialogue).
 *
 *  b) sp.score never exists on the orientative path: buildOrientativeSpeakingHint()
 *     (js/bootstrap/featureSpeaking.js) returns note/words/min/lengthOk and speakingParts is
 *     built only from it (results.js). So `· ${sp.score}%` rendered "undefined%" and
 *     passOk(undefined) === false painted the row 'bad' — an unscored part shown as a failure,
 *     while the writing branch right above guards with `score != null && !orientative ? … : 'mid'`.
 *     Language-agnostic, so this half hit de/B1 and de/A2 in production too.
 *
 * Run:  node scripts/lib/__tests__/results.speaking-part-heading.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// results.js is a classic script (no exports) — evaluate it with the globals it touches at
// load time and pull renderCorrectionHtml out of the context.
function loadRenderCorrectionHtml() {
  const ctx = {
    console, window: {}, S: {}, setTimeout, clearTimeout,
    // esc() lives in another classic script; results.js just expects it on the global.
    esc: (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    document: { getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/exam/results.js'), 'utf8'), ctx, {
      filename: 'results.js',
    });
  } catch (_) {
    // Load-time references to absent globals are fine; the function is already defined.
  }
  return ctx.renderCorrectionHtml;
}

let passed = 0, failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

const renderCorrectionHtml = loadRenderCorrectionHtml();
assert('renderCorrectionHtml is reachable', typeof renderCorrectionHtml === 'function');
if (typeof renderCorrectionHtml !== 'function') {
  console.error('\nspeaking part heading: could not isolate renderCorrectionHtml\n');
  process.exit(1);
}

/** Exactly what buildOrientativeSpeakingHint returns: a note, no score. */
const orientative = (teil, note) => ({ note, words: 0, min: 40, lengthOk: false, part: { teil } });
/** What an AI-evaluated part looks like. */
const scored = (teil, score) => ({ note: 'ok', score, part: { teil } });

const render = (parts, isDE) =>
  renderCorrectionHtml({ parts: [], writingParts: [], speakingParts: parts }, {}, isDE, 60);

// ── a) no German leaking into the non-German heading ───────────────────────
const en = render([orientative(1, 'Not evaluated (orientative) — 0/40 words')], false);
assert('English heading says "Part", not "Teil"', /Speaking — Part 1/.test(en));
assert('English heading has no "Teil" anywhere', !/Teil/.test(en));

const de = render([orientative(1, 'Nicht evaluiert (orientativ) — 0/40 Wörter')], true);
assert('German heading still says "Sprechen — Teil 1"', /Sprechen — Teil 1/.test(de));

// ── b) an unscored part is neither "undefined%" nor a failure ──────────────
assert('no "undefined%" in the English heading', !/undefined/.test(en));
assert('no "undefined%" in the German heading', !/undefined/.test(de));
assert('unscored part gets the neutral row class', /corr-row mid/.test(en));
assert('unscored part is NOT painted as a failure', !/corr-row bad/.test(en));
assert('unscored German part is neutral too (de/B1, de/A2 in prod)', /corr-row mid/.test(de));

// ── the scored path must be untouched ──────────────────────────────────────
const pass = render([scored(2, 75)], false);
assert('a scored part still prints its percentage', /Speaking — Part 2 · 75%/.test(pass));
assert('a scored part above the bar is "ok"', /corr-row ok/.test(pass));

const fail = render([scored(3, 40)], false);
assert('a scored part below the bar is still "bad"', /corr-row bad/.test(fail));
assert('a scored part below the bar prints its percentage', /Speaking — Part 3 · 40%/.test(fail));

// score 0 is a real score, not a missing one
const zero = render([scored(4, 0)], false);
assert('score 0 prints as 0%, not blank', /Speaking — Part 4 · 0%/.test(zero));
assert('score 0 is graded, not neutral', /corr-row bad/.test(zero) && !/corr-row mid/.test(zero));

console.log(`\nspeaking part heading: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
