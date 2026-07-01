#!/usr/bin/env node
/** Modular vs whole-exam grading (B1/B2 modular, A2 combined points). */
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

assert('59% does not pass at 60% threshold', !MG.modulePassed(59, passPct));
assert('60% passes at 60% threshold', MG.modulePassed(60, passPct));
assert('61% passes at 60% threshold', MG.modulePassed(61, passPct));

const tenItems = MG.scorableModuleResult(6, 10, passPct);
assert('6/10 = 60% passes', tenItems.scorePct === 60 && tenItems.passed === true);

const invalidExcluded = MG.scorableModuleResult(5, 9, passPct);
assert(
  'invalid item excluded from denominator (5/9=56% fails)',
  invalidExcluded.scorePct === 56 && invalidExcluded.passed === false,
);

const bpB1 = { examType: 'goethe', passPercentPerModule: 60 };
assert('blueprint passPercent read', MG.getPassPercent(bpB1, null) === 60);
assert('B1 goethe is modular', MG.isModularGoetheExam({ goetheFormat: true, lang: 'de', level: 'B1' }, bpB1));

const a2Blueprint = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_A2.json'), 'utf8'),
);
assert('A2 goethe is not modular', !MG.isModularGoetheExam({ goetheFormat: true, lang: 'de', level: 'A2' }, a2Blueprint));
assert('A2 blueprint scope whole-exam', MG.getGradingScope(a2Blueprint, { level: 'A2', lang: 'de' }) === 'whole-exam');
assert('A2 isWholeExamGrading', MG.isWholeExamGrading({ goetheFormat: true, lang: 'de', level: 'A2' }, a2Blueprint));

assert(
  'lesen 20/20 scales to 25 points',
  MG.pointsFromScorable(20, 20, MG.getModuleMaxPoints(a2Blueprint, 'lesen')) === 25,
);
assert(
  'horen 10/20 scales to 13 points (rounded)',
  MG.pointsFromScorable(10, 20, 25) === 13,
);

const modularResults = {
  lesen: MG.scorableModuleResult(18, 30, passPct),
  horen: MG.scorableModuleResult(20, 30, passPct),
  schreiben: MG.unevaluatedModuleResult(),
  sprechen: MG.unevaluatedModuleResult(),
};
const summary = MG.summarizeExam(modularResults, { modular: true, passPercent: passPct, blueprint: bpB1 });
assert('2/4 modules passed when writing/speaking unevaluated', summary.modulesPassed === 2);
assert('global not passed until all 4 evaluated', summary.globalPassed === false);
assert('informative avg of evaluated modules', summary.informativeScorePct === 64);
assert('B1 summary scope modular', summary.gradingScope === 'modular');

const allPass = {
  lesen: MG.scorableModuleResult(18, 30, passPct),
  horen: MG.scorableModuleResult(18, 30, passPct),
  schreiben: MG.scorableModuleResult(12, 20, passPct),
  sprechen: MG.scorableModuleResult(9, 15, passPct),
};
const allSummary = MG.summarizeExam(allPass, { modular: true, passPercent: passPct, blueprint: bpB1 });
assert('global passed when all 4 modules pass', allSummary.globalPassed === true);

const bpB2 = { examType: 'goethe', passPercentPerModule: 60, modularGrading: true };
assert('B2 is modular', MG.getGradingScope(bpB2, { level: 'B2', lang: 'de' }) === 'modular');

const a2Fail = {
  lesen: MG.scorableModuleResultWithPoints(12, 20, passPct, a2Blueprint, 'lesen'),
  horen: MG.scorableModuleResultWithPoints(12, 20, passPct, a2Blueprint, 'horen'),
  schreiben: MG.aiEvaluatedModuleResultWithPoints(56, passPct, a2Blueprint, 'schreiben'),
  sprechen: MG.aiEvaluatedModuleResultWithPoints(100, passPct, a2Blueprint, 'sprechen'),
};
const failSummary = MG.summarizeExam(a2Fail, { blueprint: a2Blueprint, gradingScope: 'whole-exam' });
assert('A2 44/75 written fails (15+15+14)', failSummary.writtenPoints === 44);
assert('A2 speaking can pass alone but whole exam fails', failSummary.speakingPassed === true);
assert('A2 global fail when written under 45', failSummary.globalPassed === false);

const a2Pass = {
  lesen: MG.scorableModuleResultWithPoints(12, 20, passPct, a2Blueprint, 'lesen'),
  horen: MG.scorableModuleResultWithPoints(12, 20, passPct, a2Blueprint, 'horen'),
  schreiben: MG.aiEvaluatedModuleResultWithPoints(60, passPct, a2Blueprint, 'schreiben'),
  sprechen: MG.aiEvaluatedModuleResultWithPoints(60, passPct, a2Blueprint, 'sprechen'),
};
const passSummary = MG.summarizeExam(a2Pass, { blueprint: a2Blueprint, gradingScope: 'whole-exam' });
assert('A2 45/75 written passes (15+15+15)', passSummary.writtenPoints === 45);
assert('A2 15/25 speaking passes', passSummary.speakingPoints === 15);
assert('A2 global pass at 45/75 + 15/25', passSummary.globalPassed === true);

const legacy = MG.migrateHistoryEntry({
  id: 1,
  score: 72,
  moduleScores: { lesen: 59, horen: 80 },
});
assert('legacy migration builds moduleResults', legacy.moduleResults.lesen.passed === false);
assert('legacy migration keeps flat moduleScores', legacy.moduleScores.horen === 80);

function loadBlueprint(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, `library/blueprints/${name}.json`), 'utf8'));
}

const a1Blueprint = loadBlueprint('goethe_A1');
assert('A1 scope whole-exam-total', MG.getGradingScope(a1Blueprint, { level: 'A1', lang: 'de' }) === 'whole-exam-total');
assert('A1 isWholeExamGrading', MG.isWholeExamGrading({ goetheFormat: true, lang: 'de', level: 'A1' }, a1Blueprint));

const a1Fail = {
  lesen: MG.aiEvaluatedModuleResultWithPoints(60, passPct, a1Blueprint, 'lesen'),
  horen: MG.aiEvaluatedModuleResultWithPoints(60, passPct, a1Blueprint, 'horen'),
  schreiben: MG.aiEvaluatedModuleResultWithPoints(60, passPct, a1Blueprint, 'schreiben'),
  sprechen: MG.aiEvaluatedModuleResultWithPoints(56, passPct, a1Blueprint, 'sprechen'),
};
const a1FailSummary = MG.summarizeExam(a1Fail, { blueprint: a1Blueprint });
assert('A1 59/100 total fails', a1FailSummary.totalPoints === 59 && a1FailSummary.globalPassed === false);

const a1Pass = {
  lesen: MG.aiEvaluatedModuleResultWithPoints(60, passPct, a1Blueprint, 'lesen'),
  horen: MG.aiEvaluatedModuleResultWithPoints(60, passPct, a1Blueprint, 'horen'),
  schreiben: MG.aiEvaluatedModuleResultWithPoints(60, passPct, a1Blueprint, 'schreiben'),
  sprechen: MG.aiEvaluatedModuleResultWithPoints(60, passPct, a1Blueprint, 'sprechen'),
};
const a1PassSummary = MG.summarizeExam(a1Pass, { blueprint: a1Blueprint });
assert('A1 60/100 total passes', a1PassSummary.totalPoints === 60 && a1PassSummary.globalPassed === true);

const c1Blueprint = loadBlueprint('goethe_C1');
assert('C1 scope modular', MG.getGradingScope(c1Blueprint, { level: 'C1', lang: 'de' }) === 'modular');
assert('C1 is modular goethe', MG.isModularGoetheExam({ goetheFormat: true, lang: 'de', level: 'C1' }, c1Blueprint));

const c1Fail = {
  lesen: MG.scorableModuleResult(17, 30, passPct),
  horen: MG.scorableModuleResult(18, 30, passPct),
  schreiben: MG.scorableModuleResult(12, 20, passPct),
  sprechen: MG.scorableModuleResult(9, 15, passPct),
};
const c1FailSummary = MG.summarizeExam(c1Fail, {
  modular: true,
  passPercent: passPct,
  blueprint: c1Blueprint,
});
assert('C1 fail when one module under 60%', c1FailSummary.globalPassed === false);

const c2Blueprint = loadBlueprint('goethe_C2');
assert('C2 scope modular', MG.getGradingScope(c2Blueprint, { level: 'C2', lang: 'de' }) === 'modular');

const camA2 = loadBlueprint('cambridge_A2');
assert('Cambridge A2 scope modular', MG.getGradingScope(camA2, { level: 'A2', lang: 'en' }) === 'modular');
const camFail = {
  lesen: MG.scorableModuleResult(17, 30, passPct),
  horen: MG.scorableModuleResult(15, 25, passPct),
  schreiben: MG.aiEvaluatedModuleResult(65, passPct),
  sprechen: MG.aiEvaluatedModuleResult(65, passPct),
};
const camFailSummary = MG.summarizeExam(camFail, { modular: true, passPercent: passPct, blueprint: camA2 });
assert('Cambridge modular fail when lesen under 60%', camFailSummary.globalPassed === false);

const deleA1 = loadBlueprint('dele_A1');
assert('DELE scope dele-groups', MG.getGradingScope(deleA1, { level: 'A1', lang: 'es' }) === 'dele-groups');
assert('DELE isDeleGroupGrading', MG.isDeleGroupGrading({ lang: 'es', level: 'A1' }, deleA1));

const deleFail = {
  lesen: MG.aiEvaluatedModuleResultWithPoints(80, passPct, deleA1, 'lesen'),
  schreiben: MG.aiEvaluatedModuleResultWithPoints(36, passPct, deleA1, 'schreiben'),
  horen: MG.aiEvaluatedModuleResultWithPoints(80, passPct, deleA1, 'horen'),
  sprechen: MG.aiEvaluatedModuleResultWithPoints(80, passPct, deleA1, 'sprechen'),
};
const deleFailSummary = MG.summarizeExam(deleFail, { blueprint: deleA1 });
assert('DELE grupo1 fail at 29/50', deleFailSummary.grupo1.points === 29 && deleFailSummary.grupo1.passed === false);
assert('DELE global fail when grupo1 fails', deleFailSummary.globalPassed === false);

const delePass = {
  lesen: MG.aiEvaluatedModuleResultWithPoints(60, passPct, deleA1, 'lesen'),
  schreiben: MG.aiEvaluatedModuleResultWithPoints(60, passPct, deleA1, 'schreiben'),
  horen: MG.aiEvaluatedModuleResultWithPoints(60, passPct, deleA1, 'horen'),
  sprechen: MG.aiEvaluatedModuleResultWithPoints(60, passPct, deleA1, 'sprechen'),
};
const delePassSummary = MG.summarizeExam(delePass, { blueprint: deleA1 });
assert('DELE grupo1 pass at 30/50', delePassSummary.grupo1.passed === true);
assert('DELE global pass when both groups pass', delePassSummary.globalPassed === true);

console.log('\nModule grading tests passed.');
