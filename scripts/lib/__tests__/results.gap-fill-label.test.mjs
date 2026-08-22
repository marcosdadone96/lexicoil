/**
 * results.gap-fill-label.test.mjs
 * Regression: gap_fill is free text, not an option letter. It was listed in
 * OPTION_LETTER_TYPES, so ansLabel() went down the letter branch, found no
 * option to label (all 36 en/B1 gap_fill items carry options:[]) and fell back
 * to .toUpperCase() — the review screen shouted "SWIMMING POOL".
 * Grading is unaffected (normalizeGradingToken); this is the label only.
 * Run:  node scripts/lib/__tests__/results.gap-fill-label.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// results.js is a classic script (no exports) — evaluate it with the globals it
// touches at load time and pull ansLabel out of the context.
function loadAnsLabel() {
  const ctx = {
    console, window: {}, document: {}, S: {}, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/exam/results.js'), 'utf8'), ctx, {
      filename: 'results.js',
    });
  } catch (_) {
    // Load-time references to absent globals are fine; ansLabel is already defined.
  }
  return ctx.ansLabel;
}

let passed = 0, failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

const ansLabel = loadAnsLabel();
assert('ansLabel is reachable', typeof ansLabel === 'function');
if (typeof ansLabel !== 'function') {
  console.error('\nresults gap-fill label: could not isolate ansLabel\n');
  process.exit(1);
}

const gap = { type: 'gap_fill', options: [] };

// 1) Free-text answers keep their own casing.
assert('multi-word answer verbatim', ansLabel(gap, 'swimming pool', false) === 'swimming pool');
assert('single word verbatim', ansLabel(gap, 'receptionist', false) === 'receptionist');
assert('proper noun keeps its case', ansLabel(gap, 'Monday', false) === 'Monday');
assert('numeric answer verbatim', ansLabel(gap, '15', false) === '15');

// 2) A one-letter cloze answer must not be read as Richtig/Falsch.
assert('"f" is not relabelled False', ansLabel(gap, 'f', false) === 'f');
assert('"t" is not relabelled True', ansLabel(gap, 't', false) === 't');
assert('"a" stays "a" (article cloze)', ansLabel(gap, 'a', false) === 'a');

// 3) Real option-letter types keep the uppercase letter label.
assert('matching still uppercases the key', ansLabel({ type: 'matching', options: [] }, 'b', false) === 'B');

// 4) Richtig/Falsch untouched.
assert('richtig_falsch still labelled', ansLabel({ type: 'richtig_falsch' }, 'R', true) === 'Richtig');

console.log(`\nresults gap-fill label: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
