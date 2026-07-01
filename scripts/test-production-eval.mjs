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
