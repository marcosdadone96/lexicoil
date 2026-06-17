#!/usr/bin/env node
/**
 * Acceptance: Lesen Teil 3 builds part.ads + part.questions (not part.items).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/library/adsMatching.js'));
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
require(path.join(ROOT, 'js/library/LibraryLoader.js'));
require(path.join(ROOT, 'js/library/PassageResolver.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));

const lang = 'de';
const level = 'B1';
const blueprint = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B1.json'), 'utf8'),
);
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library', lang, level, 'questions.json'), 'utf8'));
ExamBlueprint.cacheBlueprint(lang, level, blueprint);

const assembled = ExamBlueprint.assemble(bank, blueprint);
const t3 = assembled.lesenParts.find((p) => p.teil === 3);

console.log('\n=== Lesen Teil 3 acceptance (de/B1) ===\n');
if (!t3) {
  console.error('FAIL: no lesen part with teil===3');
  process.exit(1);
}

console.log(`teil:              ${t3.teil}`);
console.log(`blueprintSlot:     ${t3.blueprintSlot}`);
console.log(`part.ads.length:   ${t3.ads?.length ?? 0}`);
console.log(`part.questions:    ${t3.questions?.length ?? 0}`);
console.log(`part.items:        ${t3.items?.length ?? 0}`);
console.log(`part.text set:     ${!!t3.text}`);

const adsOk = (t3.ads?.length ?? 0) >= 10;
const qsOk = t3.questions?.length === 7;
const itemsEmpty = !t3.items?.length;
const allMatching = (t3.questions || []).every((q) => q.type === 'matching');
const keyOpts = (t3.questions || []).every(
  (q) =>
    Array.isArray(q.options) &&
    q.options.length >= 10 &&
    q.options.every((o) => /^[A-J0]$/.test(String(o))),
);

let fail = false;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) fail = true;
}

check('part.ads.length >= 10', adsOk);
check('part.questions.length === 7', qsOk);
check('part.items empty', itemsEmpty);
check('all questions type matching', allMatching);
check('question options are ad keys A–J/0', keyOpts);

if (t3.ads?.length) {
  console.log('\nSample ads (first 2):');
  t3.ads.slice(0, 2).forEach((a) => console.log(`  ${a.key}: ${a.title || '(no title)'} — ${a.text.slice(0, 60)}…`));
}

const exam = ExamBuilder.buildFromBlueprint(lang, level, bank, blueprint, { mode: 'standard' });
const t3Exam = exam.lesenParts?.find((p) => p.teil === 3);
check('buildFromBlueprint T3 has ads+questions', !!(t3Exam?.ads?.length && t3Exam?.questions?.length));

console.log(fail ? '\nSome checks FAILED.\n' : '\nAll checks PASSED.\n');
process.exit(fail ? 1 : 0);
