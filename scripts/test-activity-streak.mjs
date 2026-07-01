#!/usr/bin/env node
/** Study streak — local dates, activity log, consecutive days. */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'js/data/activityTrack.js'), 'utf8');
const sandbox = { window: {}, console };
vm.runInContext(src, vm.createContext(sandbox));
const AT = sandbox.window.ActivityTrack;

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

function localDayOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return AT.localDayKey(d);
}

const today = AT.localDayKey(Date.now());
const yesterday = localDayOffset(-1);

const log = [
  { id: 'a1', ts: Date.now(), day: today, type: 'exam', sec: 1200, label: 'Practice exam' },
  { id: 'a2', ts: Date.now() - 86400000, day: yesterday, type: 'exam', sec: 900, label: 'Practice exam' },
];

const st = AT.computeStudyTime(log);
assert('two consecutive exam days → streak 2', st.streak === 2);
assert('getStreak uses activity log', AT.getStreak({ activityLog: log, studyTime: { streak: 0 } }) === 2);

const todayOnly = [{ id: 'b1', ts: Date.now(), day: today, type: 'vocab_quiz', sec: 45, label: 'Quiz' }];
assert('activity today only → streak 1', AT.getStreak({ activityLog: todayOnly }) === 1);

const gap = [
  { id: 'c1', ts: Date.now(), day: today, type: 'exam', sec: 600, label: 'Exam' },
  { id: 'c2', ts: Date.now() - 172800000, day: localDayOffset(-2), type: 'exam', sec: 600, label: 'Exam' },
];
assert('gap day breaks streak → 1', AT.getStreak({ activityLog: gap }) === 1);

const examNoTime = [{ id: 'd1', ts: Date.now(), day: today, type: 'exam', sec: 0, label: 'Exam done' }];
assert('exam with sec 0 still counts as active day', AT.getStreak({ activityLog: examNoTime }) === 1);

console.log('\nActivity streak tests passed.');
