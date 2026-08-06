#!/usr/bin/env node
/**
 * Progress tab — history score migration + part-tracking exclusion.
 * Simulates operator-like lc_hist with mixed part rows and score:undefined exams.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MG = require(path.join(ROOT, 'js/ui/exam/moduleGrading.js'));

const goal = { subject: 'de', level: 'B1' };

function historyFor(history, goal) {
  return history.filter((h) => h.lang === goal.subject && h.level === goal.level);
}

function examHistoryFor(history, goal) {
  return historyFor(history, goal).filter((h) => MG.isExamResultHistoryEntry(h));
}

function readinessPct(history, goal) {
  const hist = examHistoryFor(history, goal);
  if (!hist.length) return 0;
  const recent = hist.slice(0, 5);
  const scores = recent.map((h) => MG.resolveHistoryScore(h)).filter((n) => Number.isFinite(n));
  if (!scores.length) return 0;
  const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
  return Math.min(100, Math.round(avg * 0.85));
}

function avgScore(history, goal) {
  const hist = examHistoryFor(history, goal);
  const scores = hist.map((h) => MG.resolveHistoryScore(h)).filter((n) => Number.isFinite(n));
  if (!scores.length) return null;
  return Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
}

function trendScores(history, goal) {
  return examHistoryFor(history, goal)
    .slice(0, 12)
    .reverse()
    .map((h) => MG.resolveHistoryScore(h))
    .filter((n) => Number.isFinite(n));
}

// ── Build 59-row operator-like history ───────────────────────────────────────
const history = [];
let id = 1700000000000;

// 40 pool section tracking rows (no score — pollute Progress before fix)
for (let i = 0; i < 40; i++) {
  history.push({
    lang: 'de',
    level: 'B1',
    partId: `part_${i}`,
    partModule: i % 2 ? 'horen' : 'lesen',
    date: Date.now() - i * 86400000,
    source: 'part',
  });
}

// 19 completed exams saved with score:undefined (modular grading bug, pre computeDisplayScore)
for (let i = 0; i < 19; i++) {
  const entry = {
    id: id++,
    lang: 'de',
    level: 'B1',
    date: new Date(Date.now() - i * 86400000).toLocaleDateString(),
    topic: `Thema ${i + 1}`,
    mode: i % 3 === 0 ? 'official' : 'practice',
    score: undefined,
    modularGrading: true,
    gradingScope: 'modular',
    moduleResults: {
      lesen: MG.buildObjectiveModuleResult(6 + (i % 4), 10, 30, 60),
      horen: MG.buildObjectiveModuleResult(7 + (i % 3), 10, 30, 60),
      schreiben: MG.unevaluatedOrientativeResult(null, false),
      sprechen: MG.unevaluatedOrientativeResult(null, false),
    },
    correction: { parts: [] },
  };
  history.push(entry);
}

assert.equal(history.length, 59, '59 history rows like operator');

// Before migration: naive avg → NaN
const naiveAvg =
  historyFor(history, goal).reduce((s, h) => s + h.score, 0) / historyFor(history, goal).length;
assert.ok(Number.isNaN(naiveAvg), 'naive avg is NaN before fix');

// Migrate all entries (loadLS / saveHist path)
const migrated = history.map((e) => MG.migrateHistoryEntry({ ...e }));

const exams = examHistoryFor(migrated, goal);
assert.equal(exams.length, 19, 'only 19 scored exams, 40 part rows excluded');

const readiness = readinessPct(migrated, goal);
assert.ok(Number.isFinite(readiness) && readiness > 0, `readiness is finite: ${readiness}`);
assert.ok(!String(readiness).includes('NaN'), 'no NaN readiness');

const avg = avgScore(migrated, goal);
assert.ok(Number.isFinite(avg) && avg >= 50 && avg <= 90, `avg score sane: ${avg}%`);

const trend = trendScores(migrated, goal);
assert.equal(trend.length, 12, '12 trend bars');
assert.ok(trend.every((n) => Number.isFinite(n)), 'all trend values finite');
assert.ok(!trend.some((n) => String(n) === 'undefined'), 'no undefined in trend');

// Display labels
const sample = migrated.find((e) => e.topic === 'Thema 1');
const resolvedSample = MG.resolveHistoryScore(sample);
assert.ok(Number.isFinite(resolvedSample) && resolvedSample >= 60 && resolvedSample <= 80, `backfill score from moduleResults: ${resolvedSample}`);
assert.ok(MG.formatHistoryDate(sample).length > 0, 'date formats');

const part = migrated.find((e) => e.source === 'part');
assert.equal(MG.resolveHistoryScore(part), null, 'part row has no score');
assert.ok(MG.isPartTrackingHistoryEntry(part), 'part row detected');

// Legacy row: moduleScores only, no score
const legacy = MG.migrateHistoryEntry({
  id: 99,
  lang: 'de',
  level: 'B1',
  topic: 'Legacy',
  mode: 'practice',
  moduleScores: { lesen: 72, horen: 68 },
  correction: { parts: [] },
});
assert.equal(MG.resolveHistoryScore(legacy), 70, 'legacy flat scores → avg 70');

console.log('OK   59 rows: 40 part + 19 exams');
console.log('OK   naive avg was NaN before fix');
console.log(`OK   readiness ${readiness}% (finite)`);
console.log(`OK   avg score ${avg}%`);
console.log(`OK   trend ${trend.join(', ')}`);
console.log('test-progress-history: ok');
