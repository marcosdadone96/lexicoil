#!/usr/bin/env node
/** Phase 6 — mastery view + recommended exam loop */
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
}

global.localStorage = new MemStorage();
global.forEachGoetheQ = (d, fn) => {
  d.lesenParts?.forEach((p, pi) => {
    p.items?.forEach((item, idx) => {
      if (item.question) fn(`lesen_${pi}`, { ...item, id: item.id || `item_${idx}` });
    });
  });
};
global.goetheAnswersMatch = (user, correct) => String(user || '').toLowerCase() === String(correct || '').toLowerCase();
global.S = { goals: [] };
global.esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
global.goalLabel = (g) => `${g.subject?.toUpperCase() || 'DE'} ${g.level || ''}`.trim();

const calls = [];
global.prepGoalContext = () => calls.push('prep');
global.generateWeaknessExam = (id) => calls.push('weakness:' + id);
global.launchGoalExam = (mode, opts) => calls.push('launch:' + mode + ':' + opts?.goalId);
global.openExamConfigurator = (id) => calls.push('config:' + id);
global.openDeckHub = (id) => calls.push('deck:' + id);
global.setFcTab = (tab) => calls.push('fcTab:' + tab);
global.showAddGoalWizard = () => calls.push('wizard');
global.openGoalWorkspace = (id, tab) => calls.push('workspace:' + id + ':' + tab);
global.deckForGoal = () => [];
global.historyForGoal = () => [];
global.dueForGoal = () => [];

const AnalyticsStore = require(path.join(ROOT, 'js/library/AnalyticsStore.js'));
global.AnalyticsStore = AnalyticsStore;
global.getMasterySummaryForGoal = (g) => AnalyticsStore.getMasterySummary(g);
const MasteryView = require(path.join(ROOT, 'js/ui/mastery/masteryView.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

assert(MasteryView.formatTagLabel('g-de-b1-passiv') === 'Passiv', 'formatTagLabel strips grammar prefix');
assert(MasteryView.formatTagLabel('t-de-b1-umwelt') === 'Umwelt', 'formatTagLabel strips topic prefix');

const goal = { id: 'g1', subject: 'de', level: 'B1' };
global.QuestionLibrary = { hasLibrary: () => true };
global.isLevelServable = () => true;

const examData = {
  lesenParts: [
    {
      items: [
        { id: 'q1', question: 'Q1?', correct: 'a', grammarTags: ['g-de-b1-passiv'] },
        { id: 'q2', question: 'Q2?', correct: 'b', grammarTags: ['g-de-b1-passiv'] },
        { id: 'q3', question: 'Q3?', correct: 'a', grammarTags: ['g-de-b1-nebensatz'] },
        { id: 'q4', question: 'Q4?', correct: 'c', grammarTags: ['g-de-b1-nebensatz'] },
      ],
    },
  ],
};

AnalyticsStore.recordExamResult(goal, { id: 1 }, examData, { q1: 'x', q2: 'x', q3: 'a', q4: 'c' });
AnalyticsStore.recordExamResult(goal, { id: 2 }, examData, { q1: 'x', q2: 'x', q3: 'x', q4: 'c' });

assert(MasteryView.canRunWeaknessExam(goal), 'canRunWeaknessExam when library + weak tags');
const rec = MasteryView.getRecommendedExam(goal);
assert(rec.kind === 'weakness', 'recommended exam is weakness 7030');
assert(rec.oneClick === true, 'weakness exam is one click');
assert(rec.desc.includes('70%'), 'desc mentions 70/30 split');
assert(rec.tags?.includes('Passiv'), 'weak tags humanized');

calls.length = 0;
rec.run();
assert(calls.includes('prep'), 'run calls prepGoalContext');
assert(calls.some((c) => c.startsWith('weakness:')), 'run starts weakness exam directly');

const html = MasteryView.renderRecommendedExamCardHtml(goal);
assert(html.includes('Recommended exam'), 'card renders recommended label');
assert(html.includes('startRecommendedExam'), 'card wires start CTA');
assert(html.includes('openMasteryForGoal'), 'card wires mastery CTA');

const panel = MasteryView.renderMasteryPanelHtml(goal);
assert(panel.includes('masteryPanel'), 'mastery panel id present');
assert(panel.includes('Passiv'), 'panel shows formatted weak grammar');

global.historyForGoal = () => [];
global.deckForGoal = () => [];
global.dueForGoal = () => [];
AnalyticsStore.replaceSnapshot({ profiles: {} });
const first = MasteryView.getRecommendedExam(goal);
assert(first.kind === 'first', 'no history → first mock exam');
assert(first.oneClick === true, 'first exam one click from dashboard');

console.log('\nUX loop tests passed.');
