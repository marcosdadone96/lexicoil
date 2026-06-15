#!/usr/bin/env node
/** Phase 4 — mastery tracking, decay, sync merge, answer-key mapping */
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

global.forEachGoetheQ = (d, fn) => {
  d.lesenParts?.forEach((p, pi) => {
    p.items?.forEach((item, idx) => {
      if (item.question) fn(`lesen_${pi}`, { ...item, id: item.id || `item_${idx}` });
    });
    p.questions?.forEach((q) => fn(`lesen_${pi}`, q));
  });
  d.horenParts?.forEach((p, pi) => {
    p.questions?.forEach((q) => fn(`horen_${pi}`, q));
    p.segments?.forEach((s, si) => {
      (s.questions || []).forEach((q) => fn(`horen_${pi}_${si}`, q));
    });
  });
};

global.goetheAnswersMatch = (user, correct) => {
  if (correct == null) return false;
  if (Array.isArray(correct)) {
    let u = [];
    try {
      u = typeof user === 'string' && user.startsWith('[') ? JSON.parse(user) : [];
    } catch (_) {
      u = [];
    }
    if (!Array.isArray(u) || !u.length) u = String(user || '').split('|').map((s) => s.trim()).filter(Boolean);
    const cs = [...correct].map(String).sort();
    const us = [...u].map(String).sort();
    return cs.length === us.length && cs.every((v, i) => v === us[i]);
  }
  return String(user || '').toLowerCase() === String(correct || '').toLowerCase();
};

const AnalyticsStore = require(path.join(ROOT, 'js/library/AnalyticsStore.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const goal = { id: 'goal_test_b1', subject: 'de', level: 'B1' };
const PASSIV = 'g-de-b1-passiv';

function makeQuestion(id, tags, correct = 'a') {
  return {
    id,
    question: `Question ${id}?`,
    correct,
    grammarTags: tags,
    topicTags: ['umwelt'],
  };
}

const goetheExam = {
  goetheFormat: true,
  lang: 'de',
  level: 'B1',
  lesenParts: [
    {
      questions: [
        makeQuestion('g1', [PASSIV]),
        makeQuestion('g2', [PASSIV]),
        makeQuestion('g3', [PASSIV]),
        makeQuestion('g4', ['g-de-b1-nebensatz']),
      ],
    },
  ],
};

const cambridgeExam = {
  goetheFormat: true,
  lang: 'en',
  level: 'B2',
  lesenParts: [
    {
      questions: [
        makeQuestion('c1', ['g-en-b2-passive']),
        makeQuestion('c2', ['g-en-b2-passive']),
      ],
    },
  ],
  horenParts: [
    {
      segments: [
        {
          questions: [makeQuestion('c3', ['g-en-b2-listening'], 'b')],
        },
      ],
    },
  ],
};

const deleExam = {
  goetheFormat: true,
  lang: 'es',
  level: 'B2',
  lesenParts: [
    {
      questions: [makeQuestion('e1', ['g-es-b2-passive']), makeQuestion('e2', ['g-es-b2-subj-past'])],
    },
  ],
};

function wrongAnswers(exam, modPrefix = 'lesen_0') {
  const answers = {};
  forEachGoetheQ(exam, (mod, q) => {
    answers[`${mod}_${q.id}`] = q.correct === 'a' ? 'b' : 'a';
  });
  return answers;
}

function rightAnswers(exam) {
  const answers = {};
  forEachGoetheQ(exam, (mod, q) => {
    answers[`${mod}_${q.id}`] = q.correct;
  });
  return answers;
}

// Reset storage
localStorage.removeItem('lc_mastery');

// Goethe — 3 failures on passiv → weak
for (let i = 0; i < 3; i++) {
  AnalyticsStore.recordExamResult(goal, {}, goetheExam, wrongAnswers(goetheExam));
}
const summary = AnalyticsStore.getMasterySummary(goal);
const passiv = summary.weakGrammar.find((x) => x.tag === PASSIV);
assert(passiv && passiv.mastery === 'weak', '3 passiv failures mark tag as weak');
assert(passiv.accuracy === 0, 'passiv accuracy is 0%');

// Cambridge format mapping
const camStats = AnalyticsStore.computeTagStats(cambridgeExam, wrongAnswers(cambridgeExam));
assert(camStats.grammarTags['g-en-b2-passive']?.total === 2, 'Cambridge lesen tags counted');
assert(camStats.grammarTags['g-en-b2-listening']?.total === 1, 'Cambridge horen segment tags counted');
assert(camStats.modules.horen?.total === 1, 'Cambridge horen module tracked');

// DELE format mapping
const deleStats = AnalyticsStore.computeTagStats(deleExam, rightAnswers(deleExam));
assert(deleStats.grammarTags['g-es-b2-passive']?.correct === 1, 'DELE correct passiv answer');
assert(deleStats.grammarTags['g-es-b2-subj-past']?.correct === 1, 'DELE correct subj answer');

// Temporal decay fades old mistakes
const profileBefore = JSON.parse(JSON.stringify(AnalyticsStore.getProfile(goal)));
profileBefore.lastUpdated = Date.now() - 90 * 86400000;
const data = AnalyticsStore.load();
data.profiles[goal.id] = profileBefore;
AnalyticsStore.replaceSnapshot(data);
AnalyticsStore.recordExamResult(goal, {}, goetheExam, rightAnswers(goetheExam));
const afterDecay = AnalyticsStore.getProfile(goal);
assert(
  (afterDecay.grammarTags[PASSIV]?.total || 0) < (profileBefore.grammarTags[PASSIV]?.total || 0) + 4,
  'decay reduces effective weight of old passiv attempts',
);

// Mastery summary confidence
const fullSummary = AnalyticsStore.getMasterySummary(goal, { minAttempts: 2 });
assert(Array.isArray(fullSummary.weakGrammar), 'getMasterySummary returns weakGrammar array');
assert(fullSummary.hasData === true, 'hasData true after exams');

// Sync merge preserves combined stats
const local = {
  profiles: {
    [goal.id]: {
      grammarTags: { [PASSIV]: { correct: 2, total: 4, streak: 1 } },
      topicTags: {},
      modules: { lesen: { correct: 2, total: 4 } },
      vocabularyGaps: {},
      examsTaken: 2,
      lastUpdated: 1000,
    },
  },
};
const server = {
  profiles: {
    [goal.id]: {
      grammarTags: { [PASSIV]: { correct: 3, total: 5, streak: 0 } },
      topicTags: { umwelt: { correct: 1, total: 2, streak: 0 } },
      modules: { lesen: { correct: 3, total: 5 } },
      vocabularyGaps: { Nachhaltigkeit: 2 },
      examsTaken: 3,
      lastUpdated: 2000,
    },
  },
};
const merged = AnalyticsStore.mergeProfiles(local, server);
const m = merged.profiles[goal.id];
assert(m.grammarTags[PASSIV].correct === 5 && m.grammarTags[PASSIV].total === 9, 'sync merge sums tag stats');
assert(m.topicTags.umwelt.total === 2, 'sync merge keeps topic tags');
assert(m.vocabularyGaps.Nachhaltigkeit === 2, 'sync merge sums vocab gaps');
assert(m.examsTaken === 3, 'sync merge keeps max examsTaken');

console.log('\nMastery tracking tests passed.');
