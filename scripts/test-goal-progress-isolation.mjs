#!/usr/bin/env node
/** Progress isolation per exam goal (lang + level): deck, due, history, readiness, saved exams. */
import assert from 'node:assert/strict';

function normalizeGoalLevel(level) {
  return level ? String(level).toUpperCase() : '';
}

function fcSourceLevel(fc) {
  if (!fc || typeof fc !== 'object') return '';
  if (fc.sourceLevel) return normalizeGoalLevel(fc.sourceLevel);
  if (fc.sourceExam?.level) return normalizeGoalLevel(fc.sourceExam.level);
  if (fc.profileId) {
    const i = String(fc.profileId).indexOf('_');
    if (i > 0) return normalizeGoalLevel(fc.profileId.slice(i + 1));
  }
  return '';
}

function fcMatchesGoal(fc, goal) {
  if (!fc || !goal) return false;
  if (fc.sourceLang !== goal.subject) return false;
  const lvl = fcSourceLevel(fc);
  if (!lvl) return false;
  return lvl === normalizeGoalLevel(goal.level);
}

function isDue(fc) {
  return fc.nextReview && Date.now() >= fc.nextReview;
}

function deckFor(flashcards, goal) {
  return (flashcards || []).filter((f) => fcMatchesGoal(f, goal));
}

function dueFor(flashcards, goal) {
  return deckFor(flashcards, goal).filter(isDue);
}

function historyFor(history, goal) {
  return (history || []).filter((h) => h.lang === goal.subject && h.level === goal.level);
}

function readinessPct(flashcards, history, goal) {
  const hist = historyFor(history, goal);
  if (!hist.length) return 0;
  const recent = hist.slice(0, 5);
  const avg = recent.reduce((s, h) => s + h.score, 0) / recent.length;
  const mastered = deckFor(flashcards, goal).filter((f) => f.interval && f.interval > 7).length;
  const bonus = Math.min(15, mastered * 2);
  return Math.min(100, Math.round(avg * 0.85 + bonus));
}

function migrateFlashcardSourceLevel(fc, goals) {
  if (!fc || fc.sourceLevel) return false;
  const derived = fcSourceLevel(fc);
  if (derived) {
    fc.sourceLevel = derived;
    return true;
  }
  const lang = fc.sourceLang || fc.lang;
  if (lang && goals) {
    const matches = goals.filter((g) => g.subject === lang);
    if (matches.length === 1) {
      fc.sourceLevel = normalizeGoalLevel(matches[0].level);
      return true;
    }
  }
  return false;
}

const goalA2 = { id: 'g1', subject: 'de', level: 'A2' };
const goalB1 = { id: 'g2', subject: 'de', level: 'B1' };

const flashcards = [
  { id: '1', word: 'Haus', sourceLang: 'de', sourceLevel: 'A2' },
  { id: '2', word: 'Büro', sourceLang: 'de', sourceLevel: 'B1' },
  { id: '3', word: 'alt', sourceLang: 'de', sourceExam: { level: 'A2', topic: 'health' } },
  { id: '4', word: 'neu', sourceLang: 'de', sourceExam: { level: 'B1' } },
  { id: '5', word: 'only-lang', sourceLang: 'de' },
  {
    id: '6',
    word: 'due-a2',
    sourceLang: 'de',
    sourceLevel: 'A2',
    nextReview: Date.now() - 1000,
  },
  {
    id: '7',
    word: 'due-b1',
    sourceLang: 'de',
    sourceLevel: 'B1',
    nextReview: Date.now() - 1000,
  },
];

const history = [
  { id: 'h1', lang: 'de', level: 'A2', score: 60, date: '2026-06-01' },
  { id: 'h2', lang: 'de', level: 'B1', score: 80, date: '2026-06-02' },
  { id: 'h3', lang: 'de', level: 'A2', score: 70, date: '2026-06-03' },
];

const savedExams = [
  { id: 's1', lang: 'de', level: 'A2', topic: 'health' },
  { id: 's2', lang: 'de', level: 'B1', topic: 'work' },
];

// Legacy card #3 migrates from sourceExam.level
const legacy = { id: '3', word: 'alt', sourceLang: 'de', sourceExam: { level: 'A2', topic: 'health' } };
assert.equal(migrateFlashcardSourceLevel(legacy, [goalA2, goalB1]), true);
assert.equal(legacy.sourceLevel, 'A2');

const deckA2 = deckFor(flashcards, goalA2);
const deckB1 = deckFor(flashcards, goalB1);
assert.deepEqual(
  deckA2.map((f) => f.id).sort(),
  ['1', '3', '6'].sort(),
  'A2 deck excludes B1 cards',
);
assert.deepEqual(
  deckB1.map((f) => f.id).sort(),
  ['2', '4', '7'].sort(),
  'B1 deck excludes A2 cards',
);
assert.ok(!deckA2.some((f) => f.id === '5'), 'undetermined level excluded from deck');

assert.equal(dueFor(flashcards, goalA2).length, 1, 'A2 due count');
assert.equal(dueFor(flashcards, goalB1).length, 1, 'B1 due count');

assert.equal(historyFor(history, goalA2).length, 2);
assert.equal(historyFor(history, goalB1).length, 1);

const rA2 = readinessPct(flashcards, history, goalA2);
const rB1 = readinessPct(flashcards, history, goalB1);
assert.notEqual(rA2, rB1, 'readiness differs per goal');

const savedA2 = savedExams.filter((e) => e.lang === goalA2.subject && e.level === goalA2.level);
const savedB1 = savedExams.filter((e) => e.lang === goalB1.subject && e.level === goalB1.level);
assert.equal(savedA2.length, 1);
assert.equal(savedB1.length, 1);

// Single goal fallback migration for orphan lang-only card
const orphan = { id: '5', word: 'only-lang', sourceLang: 'de' };
assert.equal(migrateFlashcardSourceLevel(orphan, [goalA2]), true);
assert.equal(orphan.sourceLevel, 'A2');

console.log('OK   deck/due isolated by lang+level');
console.log('OK   history/readiness isolated by lang+level');
console.log('OK   saved exams filter by lang+level');
console.log('OK   legacy sourceExam.level migration');
console.log('test-goal-progress-isolation: ok');
