#!/usr/bin/env node
/** Exam display score — answered-only denominator, partial modules, A2/B1. */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MG = require(path.join(ROOT, 'js/ui/exam/moduleGrading.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const passPct = 60;

// --- answered-only module scoring ---
assert('6/10 answered correct = 60%', MG.scorableModuleResult(6, 10, passPct).scorePct === 60);
assert('6/10 passes at 60% threshold', MG.scorableModuleResult(6, 10, passPct).passed === true);

const partialLesen = MG.buildObjectiveModuleResult(6, 10, 40, passPct);
assert('partial lesen: 6/10 answered, 40 presented → 60%', partialLesen.scorePct === 60);
assert('partial lesen evaluated when answered > 0', partialLesen.evaluated === true);

const emptyHoren = MG.buildObjectiveModuleResult(0, 0, 30, passPct);
assert('unattempted horen not evaluated', emptyHoren.evaluated === false);
assert('unattempted horen has no score', emptyHoren.scorePct == null);

// B1 modular: lesen+horen answered, schreiben/sprechen not attempted
const b1Partial = {
  lesen: MG.buildObjectiveModuleResult(6, 10, 30, passPct),
  horen: MG.buildObjectiveModuleResult(8, 10, 30, passPct),
  schreiben: MG.unevaluatedOrientativeResult(null, false),
  sprechen: MG.unevaluatedOrientativeResult(null, false),
};
const b1Summary = MG.summarizeExam(b1Partial, { modular: true, passPercent: passPct });
assert('B1 partial avg of answered modules = 70%', b1Summary.informativeScorePct === 70);
assert('B1 partial display score = 70%', MG.computeDisplayScore(b1Summary, b1Partial) === 70);
assert('B1 partial not below 10%', MG.computeDisplayScore(b1Summary, b1Partial) >= 10);

// Simulated bug: old logic counted all presented items (6/40 lesen)
const oldStyleLesen = MG.scorableModuleResult(6, 40, passPct);
assert('old-style 6/40 would wrongly show 15%', oldStyleLesen.scorePct === 15);
const oldStyleSummary = MG.summarizeExam(
  {
    lesen: oldStyleLesen,
    horen: MG.buildObjectiveModuleResult(0, 0, 30, passPct),
    schreiben: MG.unevaluatedOrientativeResult(null, false),
    sprechen: MG.unevaluatedOrientativeResult(null, false),
  },
  { modular: true, passPercent: passPct },
);
assert('old-style single module would show 15% (the bug)', oldStyleSummary.informativeScorePct === 15);

// Full B1 with productive unevaluated
const b1Full = {
  lesen: MG.buildObjectiveModuleResult(18, 30, 30, passPct),
  horen: MG.buildObjectiveModuleResult(20, 30, 30, passPct),
  schreiben: MG.unevaluatedOrientativeResult('Not evaluated', false),
  sprechen: MG.unevaluatedOrientativeResult('Not evaluated', false),
};
const b1FullSummary = MG.summarizeExam(b1Full, { modular: true, passPercent: passPct });
assert('B1 full objective-only avg = 64%', b1FullSummary.informativeScorePct === 64);
assert('B1 full display score coherent', MG.computeDisplayScore(b1FullSummary, b1Full) === 64);

// A2 whole-exam partial (only lesen+horen, no AI on writing/speaking)
const a2Blueprint = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_A2.json'), 'utf8'),
);
const a2Partial = {
  lesen: MG.scorableModuleResultWithPoints(15, 20, passPct, a2Blueprint, 'lesen'),
  horen: MG.scorableModuleResultWithPoints(13, 20, passPct, a2Blueprint, 'horen'),
  schreiben: MG.unevaluatedOrientativeResult(null, false),
  sprechen: MG.unevaluatedOrientativeResult(null, false),
};
const a2PartialSummary = MG.summarizeExam(a2Partial, {
  blueprint: a2Blueprint,
  gradingScope: 'whole-exam',
});
assert('A2 partial written points 35', a2PartialSummary.writtenPoints === 35);
assert(
  'A2 partial display uses evaluated max (50) not full 100 → 70%',
  a2PartialSummary.informativeScorePct === 70,
);
assert('A2 partial display score ≥ 10%', MG.computeDisplayScore(a2PartialSummary, a2Partial) >= 10);

// Single-module partial label
const singleOnly = {
  lesen: MG.buildObjectiveModuleResult(6, 10, 40, passPct),
  horen: MG.buildObjectiveModuleResult(0, 0, 30, passPct),
  schreiben: MG.unevaluatedOrientativeResult(null, false),
  sprechen: MG.unevaluatedOrientativeResult(null, false),
};
const singleSummary = MG.summarizeExam(singleOnly, { modular: true, passPercent: passPct });
const singleInfo = MG.getDisplayScoreInfo(singleOnly, singleSummary, passPct, false);
assert('single evaluated module shows module label', singleInfo.heroScore.includes('Reading: 60%'));

// Reasonable attempt never below 10% when half correct on answered items
const reasonable = MG.summarizeExam(
  {
    lesen: MG.buildObjectiveModuleResult(5, 10, 50, passPct),
    horen: MG.buildObjectiveModuleResult(0, 0, 50, passPct),
  },
  { modular: true, passPercent: passPct },
);
assert('reasonable partial attempt shows 50% not 5%', MG.computeDisplayScore(reasonable, {}) === 50);

console.log('\nExam score calculation tests passed.');
