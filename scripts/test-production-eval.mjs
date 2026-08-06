#!/usr/bin/env node
/** Production eval — AI score feeds module, cache, quota fallback */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CORE = require(path.join(ROOT, 'js/ui/exam/productionEvalCore.js'));
const MG = require(path.join(ROOT, 'js/ui/exam/moduleGrading.js'));
const {
  normalizeProductionEvalResponse,
  normalizeSchreibenItem,
} = require(path.join(ROOT, 'netlify/functions/lib/productionEval.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const passPct = 60;
const schreibenTasks = [
  { id: '1', task: 'Schreiben Sie eine E-Mail.', userText: 'Sehr geehrte Damen und Herren...', minWords: 80 },
];
const sprechenTasks = [
  { id: '2', transcript: 'Ich denke dass...', situation: 'Diskussion', points: ['Meinung'] },
];

const aiPayload = {
  schreiben: [{
    id: '1',
    totalScore: 72,
    passed: true,
    rubric: { erfuellung: 18, kohaerenz: 17, wortschatz: 19, strukturen: 18 },
    correctedText: 'Korrigiert',
    errors: [],
    summary: 'Gut',
    grammarPoints: [],
  }],
  sprechen: [{
    id: '2',
    totalScore: 68,
    passed: true,
    criteria: [{ name: 'Task Achievement', score: 4, comment: 'OK' }],
    overallFeedback: 'Solid',
    strongPoints: [],
    improvements: [],
    correctedVersion: '',
  }],
};

const normalized = normalizeProductionEvalResponse(aiPayload, {
  schreiben: schreibenTasks,
  sprechen: sprechenTasks,
  passPercent: passPct,
});
assert('normalize production eval ok', normalized.ok === true);
assert('schreiben score parsed', normalized.schreiben[0].score === 72);
assert('59% fails threshold', !MG.modulePassed(59, passPct));
assert('60% passes threshold', MG.modulePassed(60, passPct));

let moduleResults = {
  lesen: MG.scorableModuleResult(18, 30, passPct),
  horen: MG.scorableModuleResult(20, 30, passPct),
};
moduleResults = CORE.applyProductionEvalToModules(moduleResults, normalized, passPct, MG);
assert('AI schreiben score feeds module', moduleResults.schreiben.evaluated && moduleResults.schreiben.scorePct === 72);
assert('AI sprechen score feeds module', moduleResults.sprechen.evaluated && moduleResults.sprechen.scorePct === 68);

// --- Goethe Schreiben 40/40/20 (does NOT affect Sprechen equal average) ---
function schParts(scoresByTeil) {
  return Object.entries(scoresByTeil).map(([teil, score]) => ({
    id: String(teil),
    score,
    partMeta: { teil: Number(teil), aufgabe: Number(teil) },
  }));
}

const w1 = CORE.weightedSchreibenModuleScore(schParts({ 1: 100, 2: 100, 3: 0 }));
assert('Schreiben 100/100/0 → 80 (40+40+0), not equal 67', w1 === 80);

const w2 = CORE.weightedSchreibenModuleScore(schParts({ 1: 50, 2: 50, 3: 100 }));
assert('Schreiben 50/50/100 → 60 (20+20+20)', w2 === 60);

const w3 = CORE.weightedSchreibenModuleScore(schParts({ 1: 80, 2: 70, 3: 60 }));
// 0.4*80 + 0.4*70 + 0.2*60 = 32+28+12 = 72
assert('Schreiben 80/70/60 → 72', w3 === 72);

const w4 = CORE.weightedSchreibenModuleScore(schParts({ 1: 90, 2: 60, 3: 30 }));
// 0.4*90 + 0.4*60 + 0.2*30 = 36+24+6 = 66
assert('Schreiben 90/60/30 → 66', w4 === 66);

const w5 = CORE.weightedSchreibenModuleScore(schParts({ 1: 40, 2: 100, 3: 100 }));
// 0.4*40 + 0.4*100 + 0.2*100 = 16+40+20 = 76
assert('Schreiben 40/100/100 → 76', w5 === 76);

const equalWouldBe = Math.round((100 + 100 + 0) / 3);
assert('equal avg of 100/100/0 would be 67 (regression marker)', equalWouldBe === 67);

const sprechenEqual = CORE.averageScores([
  { score: 100 },
  { score: 100 },
  { score: 0 },
]);
assert('Sprechen still equal-average 100/100/0 → 67', sprechenEqual === 67);

const appliedWeighted = CORE.applyProductionEvalToModules(
  { lesen: MG.scorableModuleResult(18, 30, passPct) },
  {
    ok: true,
    schreiben: schParts({ 1: 100, 2: 100, 3: 0 }),
    sprechen: [
      { id: '1', score: 100 },
      { id: '2', score: 50 },
    ],
  },
  passPct,
  MG,
);
assert('applyProductionEval schreiben uses 40/40/20 → 80', appliedWeighted.schreiben.scorePct === 80);
assert('applyProductionEval sprechen still equal → 75', appliedWeighted.sprechen.scorePct === 75);
assert('lesen untouched', appliedWeighted.lesen.scorePct === 60);

// Lesen/Hören moduleGrading summarizeExam still equal-module average (unchanged)
const modSum = MG.summarizeExam(
  {
    lesen: MG.scorableModuleResult(100, 100, passPct),
    horen: MG.scorableModuleResult(50, 100, passPct),
  },
  { modular: true, passPercent: passPct },
);
assert('Lesen/Hören modular avg still equal 75%', modSum.informativeScorePct === 75);

const payload = { lang: 'de', level: 'B1', passPercent: passPct, schreiben: schreibenTasks, sprechen: sprechenTasks };
const key = CORE.hashProductionSubmission(payload);
CORE.writeProductionEvalCache(key, normalized);
const cached = CORE.readProductionEvalCache(key);
assert('retry uses cache', cached.ok === true && cached.schreiben[0].score === 72);

const fallback = CORE.applyOrientativeFallback(
  { schreiben: MG.unevaluatedModuleResult() },
  {
    schreibenHints: [{ hint: 'Orientativ: 45/80 Wörter — zu kurz' }],
    isDE: true,
  },
  MG,
);
assert('no budget -> evaluated=false', fallback.schreiben.evaluated === false);
assert('no budget -> no scorePct', fallback.schreiben.scorePct == null);
assert('orientative label', fallback.schreiben.orientative === true);

const scoredWriting = normalizeSchreibenItem(
  { totalScore: 59, rubric: { erfuellung: 15, kohaerenz: 14, wortschatz: 15, strukturen: 15 }, correctedText: 'x' },
  passPct,
);
assert('writing rubric 59% not passed', scoredWriting.passed === false);

console.log('\nProduction eval tests passed.');
