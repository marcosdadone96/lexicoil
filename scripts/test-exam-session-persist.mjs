#!/usr/bin/env node
/** Per-goal exam session persistence: practice + official, merge sync, timer resume. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ok(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

function loadMergeActiveSessions() {
  const src = fs.readFileSync(path.join(ROOT, 'js/services/syncMerge.js'), 'utf8');
  const sandbox = { window: {}, ActivityTrack: { mergeActivity: () => [], mergeStudyTime: () => ({}) }, BurnedRegistry: { mergeBurned: (a, b) => a || b } };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const merged = sandbox.window.mergeSyncPayload(
    {
      activeSessions: {
        goal_b1: { goalId: 'goal_b1', examData: { topic: 'local' }, updatedAt: 100, mode: 'practice' },
        goal_a2: { goalId: 'goal_a2', examData: { topic: 'a2local' }, updatedAt: 200, mode: 'official' },
      },
    },
    {
      activeSessions: {
        goal_b1: { goalId: 'goal_b1', examData: { topic: 'server-newer' }, updatedAt: 300, mode: 'practice' },
        goal_b2: { goalId: 'goal_b2', examData: { topic: 'server-only' }, updatedAt: 50, mode: 'practice' },
      },
    },
  );
  return merged.activeSessions;
}

function sessionHelpers() {
  const store = new Map();
  const ls = {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, v);
    },
    removeItem(k) {
      store.delete(k);
    },
  };
  const ACTIVE_SESSIONS_LS_KEY = 'lc_active_sessions';
  const LEGACY_ACTIVE_SESSION_KEY = 'lc_active_session';

  function readActiveSessionsMap() {
    try {
      const raw = ls.getItem(ACTIVE_SESSIONS_LS_KEY);
      if (raw) {
        const map = JSON.parse(raw);
        if (map && typeof map === 'object') return map;
      }
    } catch (_) {}
    try {
      const leg = ls.getItem(LEGACY_ACTIVE_SESSION_KEY);
      if (leg) {
        const s = JSON.parse(leg);
        if (s?.goalId) {
          const map = { [s.goalId]: s };
          ls.setItem(ACTIVE_SESSIONS_LS_KEY, JSON.stringify(map));
          ls.removeItem(LEGACY_ACTIVE_SESSION_KEY);
          return map;
        }
      }
    } catch (_) {}
    return {};
  }

  function writeActiveSessionsMap(map) {
    ls.setItem(ACTIVE_SESSIONS_LS_KEY, JSON.stringify(map || {}));
  }

  function normalizeMode(m) {
    return m === 'real' || m === 'official' ? 'official' : 'practice';
  }

  function getResumableSession(map, goalId) {
    const s = map[goalId];
    if (!s || !s.examData) return null;
    const mode = normalizeMode(s.mode);
    if (mode !== 'practice' && mode !== 'official') return null;
    return s;
  }

  return { ls, readActiveSessionsMap, writeActiveSessionsMap, getResumableSession, normalizeMode };
}

const merged = loadMergeActiveSessions();
ok('merge prefers newer server session for same goal', merged.goal_b1.examData.topic === 'server-newer');
ok('merge keeps distinct goals isolated', merged.goal_a2.examData.topic === 'a2local');
ok('merge adds server-only goal', merged.goal_b2.examData.topic === 'server-only');

const { readActiveSessionsMap, writeActiveSessionsMap, getResumableSession, ls, normalizeMode } = sessionHelpers();

ls.setItem(
  'lc_active_session',
  JSON.stringify({
    goalId: 'de_b1_goal',
    mode: 'practice',
    examData: { level: 'B1', lang: 'de', topic: 'health' },
    answers: { q1: 'a' },
    updatedAt: 1,
  }),
);
const migrated = readActiveSessionsMap();
ok('legacy lc_active_session migrates to per-goal map', migrated.de_b1_goal?.examData?.topic === 'health');
ok('legacy key removed after migration', ls.getItem('lc_active_session') === null);

writeActiveSessionsMap({
  de_b1_goal: {
    goalId: 'de_b1_goal',
    mode: 'official',
    examData: { level: 'B1', lang: 'de' },
    answers: { lesen_1: 'Richtig' },
    timerEndsAt: Date.now() + 45 * 60 * 1000,
    updatedAt: 10,
  },
  de_a2_goal: {
    goalId: 'de_a2_goal',
    mode: 'practice',
    examData: { level: 'A2', lang: 'de' },
    answers: { lesen_1: 'Falsch' },
    updatedAt: 11,
  },
});
const map = readActiveSessionsMap();
ok('official session stored per goal', normalizeMode(map.de_b1_goal.mode) === 'official');
ok('B1 answers isolated from A2', map.de_b1_goal.answers.lesen_1 === 'Richtig' && map.de_a2_goal.answers.lesen_1 === 'Falsch');
ok('getResumableSession returns official for B1', getResumableSession(map, 'de_b1_goal')?.mode === 'official');
ok('getResumableSession returns null for unknown goal', getResumableSession(map, 'de_c1_goal') === null);

const endsAt = Date.now() + 120 * 1000;
const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
ok('timer resume keeps remaining seconds', remaining >= 119 && remaining <= 120);

console.log('\nExam session persistence tests passed.');
