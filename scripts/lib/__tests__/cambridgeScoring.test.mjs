/**
 * cambridgeScoring.test.mjs
 *
 * Two scoring bugs found submitting a full en/B1 exam in the app, both invisible from the
 * exam screen — you only see them on the results page.
 *
 *  a) 12 of the 57 marks were never scored. getRenderableAnswerKeys derives a gap_fill's
 *     key set from part.options, and free-text gap_fill has none: Cambridge Reading Part 6
 *     is open cloze and Listening Part 3 is sentence completion. isAnswerKeyRenderable read
 *     the empty key set as "the answer key does not match the options shown" and dropped the
 *     items. A fully correct paper came back "12 question(s) excluded due to data error",
 *     and a wrong answer in those parts cost nothing.
 *
 *  b) The verdict said "Fail - 170/140 (Cambridge Scale)" — a fail whose own number is
 *     above the pass mark. globalPassed needs every skill evaluated and Writing/Speaking
 *     need AI scoring, so without it the exam is not failed, it is unfinished. The modular
 *     (German) scope already words this honestly as "2/4 Module bestanden".
 *
 * Run:  node scripts/lib/__tests__/cambridgeScoring.test.mjs
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { isAnswerKeyRenderable } = require(path.join(ROOT, 'js/engine/validation/isAnswerKeyRenderable.js'));
const { globalResultLabel } = require(path.join(ROOT, 'js/ui/exam/moduleGrading.js'));

let passed = 0;
let failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

// ── a) free-text gap_fill is scorable ──────────────────────────────────────
assert(
  'open cloze (Reading P6) counts',
  isAnswerKeyRenderable({ type: 'gap_fill', correct: 'for', options: [] }, {}) === true,
);
assert(
  'sentence completion (Listening P3) counts',
  isAnswerKeyRenderable({ type: 'gap_fill', correct: 'computers', options: [] }, { options: [] }) === true,
);
assert(
  'a gap with no key is still rejected',
  isAnswerKeyRenderable({ type: 'gap_fill', correct: '', options: [] }, {}) === false &&
    isAnswerKeyRenderable({ type: 'gap_fill', correct: '   ', options: [] }, {}) === false,
);
assert(
  'a gap WITH a pool still has to match it',
  isAnswerKeyRenderable({ type: 'gap_fill', correct: 'A' }, { options: [{ key: 'A' }, { key: 'B' }] }) === true &&
    isAnswerKeyRenderable({ type: 'gap_fill', correct: 'Z' }, { options: [{ key: 'A' }, { key: 'B' }] }) === false,
);
assert(
  'an option-less MCQ is still rejected — that one really is broken data',
  isAnswerKeyRenderable({ type: 'multiple_choice', correct: 'A', options: [] }, {}) === false,
);

// ── b) the verdict wording ─────────────────────────────────────────────────
const partial = { gradingScope: 'cambridge-scale', globalPassed: false, overallScale: 170, passScale: 140, modulesEvaluated: 2, totalModules: 4 };
const partialLabel = globalResultLabel(partial, false);
assert('a half-scored exam is not called a fail', !/\bFail\b/.test(partialLabel));
assert('it says how much was scored', partialLabel.includes('2/4') && partialLabel.includes('170/140'));
assert('German gets the same wording', globalResultLabel(partial, true).includes('2/4') && !/Nicht bestanden/.test(globalResultLabel(partial, true)));

const realFail = { ...partial, modulesEvaluated: 4, overallScale: 132 };
assert('a fully scored exam below the mark is still a fail', /^Fail - 132\/140/.test(globalResultLabel(realFail, false)));
assert('and in German', /^Nicht bestanden - 132\/140/.test(globalResultLabel(realFail, true)));

const pass = { ...partial, modulesEvaluated: 4, globalPassed: true };
assert('a pass is still a pass', globalResultLabel(pass, false).startsWith('Pass'));

// The modular (German) scope must not be touched by any of this.
const modular = { gradingScope: 'modular', modular: true, totalModules: 4, modulesPassed: 2, globalPassed: false };
const modularLabel = globalResultLabel(modular, true);
assert(`modular German wording unchanged ("${modularLabel}")`, modularLabel.includes('2/4'));

console.log(`\ncambridge scoring: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
