#!/usr/bin/env node
/** Autosave: change → debounced in_progress → refresh → retakeExam(resume) without loss. */
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

function loadAutosaveSandbox() {
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examRunner.js'), 'utf8');
  const start = src.indexOf('const EXAM_AUTOSAVE_MS');
  const end = src.indexOf('// ═══════════════════════════════════════════\n// TIMER');
  const block = src.slice(start, end);

  const sessionStore = new Map();
  const savedCalls = [];
  const S = {
    examData: {
      topic: 'transport',
      level: 'B1',
      lang: 'de',
      goetheFormat: true,
      lesenParts: [{ teil: 1, questions: [{ id: '1' }, { id: '2' }] }],
    },
    answers: {},
    gapAnswers: {},
    savedExams: [],
    isDemo: false,
    quickMod: null,
    mode: 'practice',
    activeGoalId: null,
    activeSession: null,
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    S,
    Auth: { hasSession: () => false },
    captureExamFieldValues: () => ({}),
    autosaveSession: () => {},
    saveCurrentExam: (status, opts) => {
      savedCalls.push({ status, opts, answers: { ...S.answers } });
      const id = S.examData._savedId || (S.examData._savedId = 9001);
      const entry = {
        id,
        status,
        topic: S.examData.topic,
        level: S.examData.level,
        lang: S.examData.lang,
        mode: S.mode,
        data: S.examData,
        answers: { ...S.answers },
        gapAnswers: { ...S.gapAnswers },
        fieldValues: {},
      };
      const idx = S.savedExams.findIndex((e) => e.id === id);
      if (idx >= 0) S.savedExams[idx] = { ...S.savedExams[idx], ...entry };
      else S.savedExams.unshift(entry);
    },
    sessionStorage: {
      setItem(k, v) {
        sessionStore.set(k, v);
      },
      getItem(k) {
        return sessionStore.get(k) ?? null;
      },
    },
    document: { addEventListener() {} },
    window: { addEventListener() {} },
  };

  vm.createContext(sandbox);
  vm.runInContext(`${block}\n`, sandbox);
  return { sandbox, savedCalls, sessionStore, S };
}

function retakeExamSim(S, i, resume) {
  const e = S.savedExams[i];
  if (!e) return;
  S.examData = e.data;
  if (resume && e.status === 'in_progress') {
    S.answers = { ...(e.answers || {}) };
    S.gapAnswers = { ...(e.gapAnswers || {}) };
  } else {
    S.answers = {};
    S.gapAnswers = {};
  }
}

const { sandbox, savedCalls, sessionStore, S } = loadAutosaveSandbox();

S.answers['lesen_1'] = 'Richtig';
sandbox.scheduleExamAutosave();

await new Promise((r) => setTimeout(r, 2100));

ok('debounced saveCurrentExam called with in_progress', savedCalls.some((c) => c.status === 'in_progress'));
ok('saved answers include lesen_1', savedCalls.at(-1)?.answers['lesen_1'] === 'Richtig');

const guestKey = sandbox.guestAutosaveKey();
const guestRaw = sessionStore.get(guestKey);
ok('guest sessionStorage backup written', !!guestRaw);
const guestParsed = JSON.parse(guestRaw);
ok('guest backup has lesen_1', guestParsed.answers['lesen_1'] === 'Richtig');

S.answers = {};
S.gapAnswers = {};
retakeExamSim(S, 0, true);
ok('resume restores lesen_1 after simulated refresh', S.answers['lesen_1'] === 'Richtig');

S.answers['lesen_2'] = 'Falsch';
sandbox.flushExamAutosave();
ok('pagehide flush persists lesen_2', S.savedExams[0].answers['lesen_2'] === 'Falsch');

console.log('\nExam autosave tests passed.');
