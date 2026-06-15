#!/usr/bin/env node
/** Phase 5 — personalized 70/30 weakness exams (no runtime AI) */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemStorage {
  constructor() {
    this.store = {};
  }
  getItem(k) {
    return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null;
  }
  setItem(k, v) {
    this.store[k] = String(v);
  }
  removeItem(k) {
    delete this.store[k];
  }
}

global.localStorage = new MemStorage();
global.forEachGoetheQ = () => {};
global.goetheAnswersMatch = () => false;

require(path.join(ROOT, 'js/library/PassageResolver.js'));
global.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
require(path.join(ROOT, 'js/library/AnalyticsStore.js'));
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
global.ExamBlueprint = ExamBlueprint;
global.ExamBuilder = ExamBuilder;
global.AnalyticsStore = require(path.join(ROOT, 'js/library/AnalyticsStore.js'));
const WeaknessEngine = require(path.join(ROOT, 'js/library/WeaknessEngine.js'));
const AnalyticsStore = global.AnalyticsStore;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const WEAK_A = 'g-de-b1-passiv';
const WEAK_B = 'g-de-b1-nebensatz';

function q(id, tags, module = 'lesen') {
  return {
    id,
    module,
    type: 'multiple',
    question: `Q ${id}?`,
    options: ['a) one', 'b) two'],
    correct: 'a',
    correctAnswer: 'a',
    grammarTags: tags,
    topicTags: ['test'],
    teil: 1,
    passageId: 'p-test-1',
  };
}

function makeBank(extra = []) {
  const questions = [];
  for (let i = 0; i < 14; i++) questions.push(q(`weak-a-${i}`, [WEAK_A]));
  for (let i = 0; i < 14; i++) questions.push(q(`weak-b-${i}`, [WEAK_B]));
  for (let i = 0; i < 12; i++) questions.push(q(`mixed-${i}`, ['g-de-b1-modal']));
  questions.push(...extra);
  return {
    meta: { language: 'de', level: 'B1', version: 1 },
    passages: [{ id: 'p-test-1', title: 'Test', text: 'Ein kurzer Testtext für Lesen.' }],
    questions,
  };
}

const miniBlueprint = {
  id: 'test_B1',
  examType: 'goethe',
  modules: [
    {
      id: 'lesen',
      parts: [{ teil: 1, slotType: 'lesen_1', itemsTotal: 10, questionTypes: ['multiple_choice', 'multiple'] }],
    },
  ],
};

const goal = { id: 'goal_p5', subject: 'de', level: 'B1', seenExams: [] };

// Seed mastery profile — both tags weak
const mastery = AnalyticsStore.load();
mastery.profiles[goal.id] = {
  grammarTags: {
    [WEAK_A]: { correct: 1, total: 8, streak: 0 },
    [WEAK_B]: { correct: 2, total: 7, streak: 0 },
  },
  topicTags: {},
  modules: {},
  vocabularyGaps: {},
  examsTaken: 3,
  lastUpdated: Date.now(),
};
AnalyticsStore.replaceSnapshot(mastery);
assert(AnalyticsStore.getWeakGrammarTags(goal, 5).length > 0, 'seeded profile exposes weak grammar tags');

let callAiCount = 0;
global.callAI = () => {
  callAiCount++;
  throw new Error('callAI should not run in Phase 5 library path');
};

ExamBlueprint.cacheBlueprint('de', 'B1', miniBlueprint);
const bank = makeBank();

const exam = WeaknessEngine.buildPersonalizedExam(goal, miniBlueprint, bank, {
  grammarTags: [WEAK_A, WEAK_B],
});

assert(!callAiCount, 'callAI not invoked');
assert(exam.personalizedExam === true, 'exam flagged personalized');
assert(exam.personalizedSplit, 'personalizedSplit report present');

const split = exam.personalizedSplit;
const ratio = split.weaknessRatioActual;
assert(
  ratio >= 0.7 || split.actualWeak >= split.targetWeak - 1,
  `weak ratio ${Math.round(ratio * 100)}% (target 70%, actual ${split.actualWeak}/${split.total})`,
);

const origins = [];
function collectOrigins(parts) {
  (parts || []).forEach((p) => {
    (p.questions || []).forEach((qq) => origins.push(qq.origin));
    (p.items || []).forEach((it) => origins.push(it.origin));
  });
}
collectOrigins(exam.lesenParts);
assert(origins.some((o) => o === 'weakness'), 'items marked origin weakness');
assert(origins.some((o) => o === 'mixed'), 'items marked origin mixed');

// No-repeat: first exam consumes 10 ids; second should not reuse them if enough stock
const firstIds = WeaknessEngine.assemble7030(bank, miniBlueprint, {
  grammarTags: [WEAK_A, WEAK_B],
  topicTags: [],
  seen: new Set(),
}).selected.map((x) => x.id);

goal.seenExams = [{ at: Date.now(), questionIds: firstIds }];
const second = WeaknessEngine.assemble7030(bank, miniBlueprint, {
  grammarTags: [WEAK_A, WEAK_B],
  topicTags: [],
  seen: new Set(firstIds),
}).selected.map((x) => x.id);

const overlap = second.filter((id) => firstIds.includes(id));
assert(overlap.length === 0, `no repeat from last exam (${overlap.length} overlaps)`);
assert(AnalyticsStore.getWeakGrammarTags(goal, 5).length > 0, 'profile still has weak tags after assembly');

// buildWeaknessExam integration (uses cached blueprint, no fetch)
global.LibraryLoader = { load: async () => bank };
global.TaggingGate = {
  gateBank: (b) => ({ passed: true, trusted: b.questions.length, total: b.questions.length, trustedQuestions: b.questions }),
};
ExamBlueprint.cacheBlueprint('de', 'B1', miniBlueprint);
const weakTags = await WeaknessEngine.getWeakTags(goal, 5);
assert(weakTags.length > 0, `weak tags for buildWeaknessExam (${weakTags.join(', ')})`);
const bpLoaded = await ExamBlueprint.load('de', 'B1');
assert(bpLoaded, 'blueprint loaded from cache');
const exam2 = await WeaknessEngine.buildWeaknessExam('de', 'B1', goal);
assert(exam2.personalizedExam === true, 'buildWeaknessExam sets personalizedExam');
assert((exam2.personalizedSplit?.total || 0) > 0, 'buildWeaknessExam split total > 0');

console.log('\nPersonalized 70/30 tests passed.');
