/**
 * sprechenPartTag.test.mjs
 *
 * Two cosmetics found in the en/B1 QA run, both only visible in the rendered exam:
 *
 *  a) The Speaking module tag read "Speaking — Part 1: Part 1 — Speaking".
 *     sprechenPartModuleTag appends the part title unless it merely repeats the tag, but
 *     isRedundantSprechenPartTitle only knew the Goethe shape ("Teil 3"). Cambridge content
 *     titles its parts "Part 1 — Speaking", so the title was appended to a tag that already
 *     said it. German was never affected — its titles match the old pattern.
 *
 *  b) "Points to cover" listed a single bullet reading "interview". The English content put
 *     the blueprint slot name in part.points, which is the list shown to the candidate (and
 *     handed to the speaking evaluator). It now lives in slotType and points is empty, which
 *     is what the German parts do.
 *
 * Run:  node scripts/lib/__tests__/sprechenPartTag.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

let passed = 0;
let failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

/** Pull the real guard out of speakingFlow.js so the test cannot drift from the source. */
function loadGuard() {
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/speakingFlow.js'), 'utf8');
  const m = src.match(/function isRedundantSprechenPartTitle[\s\S]*?\n  }/);
  if (!m) throw new Error('isRedundantSprechenPartTitle not found in speakingFlow.js');
  return new Function(`return (${m[0].replace('function isRedundantSprechenPartTitle', 'function')})`)();
}

const isRedundant = loadGuard();

// ── a) titles that only repeat the tag ─────────────────────────────────────
const redundant = [
  ['Teil 1', 1],            // Goethe, the shape the guard already knew
  ['Teil 3 — Sprechen', 3],
  ['Part 1', 1],
  ['Part 1 — Speaking', 1], // Cambridge, the one that leaked
  ['Part 4 — Speaking', 4],
  ['Speaking Part 1', 1],
];
for (const [title, teil] of redundant) {
  assert(`"${title}" (Teil ${teil}) is dropped from the tag`, isRedundant(title, teil) === true);
}

const kept = [
  ['Gemeinsam etwas planen', 3],   // a real Goethe title must survive
  ['Über Freizeit sprechen', 2],   // contains "sprechen" but says more
  ['Part 2 — Photo description', 2],
  ['Part 1 — Speaking', 2],        // right shape, wrong number
  ['', 1],
];
for (const [title, teil] of kept) {
  assert(`"${title}" (Teil ${teil}) is kept`, isRedundant(title, teil) === false);
}

// ── b) the slot name is metadata, not a bullet for the candidate ───────────
const SLOTS = ['interview', 'photo_description', 'collaborative_task', 'general_conversation'];
const exams = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams/en_B1.json'), 'utf8'));
const parts = exams.flatMap((e) => e.sprechenParts || []);
assert(`en/B1 ships its speaking parts (${parts.length})`, parts.length === 12);
assert(
  'no slot name is shown as a point to cover',
  parts.every((p) => !(p.points || []).some((x) => SLOTS.includes(String(x)))),
);
assert(
  'the slot name is kept as metadata instead',
  parts.every((p) => SLOTS.includes(String(p.slotType))),
);
assert(
  'every speaking part still carries its task text',
  parts.every((p) => String(p.situation || p.task || '').trim().length > 20),
);

console.log(`\nsprechen part tag: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
