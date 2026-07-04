#!/usr/bin/env node
/** Sprechen tier scaffold: modes, adapter mapping, flow router. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else console.log('OK:', msg);
}

const window = {};
const ctx = { window, console, S: { subject: 'de', level: 'B1', plan: 'free' }, module: { exports: {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/config/speakingModes.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/publishedExamAdapter.js'), 'utf8'), ctx);

ok(window.SpeakingModes?.REALTIME_PERSONALITIES?.length === 3, '3 realtime personalities');
ok(window.SpeakingModes.personalityById('quiet')?.verbosity === 'low', 'quiet persona');
ok(window.SpeakingModes.personalityById('talkative')?.verbosity === 'high', 'talkative persona');

const sample = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/merged/sprechen-stadtfest-planung-01.json'), 'utf8'),
);
const q1 = sample.questions.find((q) => q.teil === 1);
const part = window.PublishedExamAdapter
  ? (function () {
      const fn = fs.readFileSync(path.join(ROOT, 'js/data/publishedExamAdapter.js'), 'utf8');
      // snapshotToExamPart is internal — use published doc round-trip via eval hack
      return null;
    })()
  : null;

// Direct snapshot shape test via duplicated apply logic
const record = { module: 'sprechen', teil: 1, instruction: 'Teil 1', questions: [q1] };
const g = { console, window: null, document: { getElementById: () => null }, localStorage: { getItem: () => null } };
g.window = g;
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/publishedExamAdapter.js'), 'utf8'), g);
const adapted = g.PublishedExamAdapter.publishedDocToServedExam({
  examId: 'test',
  title: 'T',
  level: 'B1',
  lang: 'de',
  slot: 99,
  manifestVersion: 1,
  parts: [{ module: 'sprechen', cell: 'sprechen_1', partId: 'p1', contentHash: 'x', snapshot: record }],
});
const sp = adapted.sprechenParts[0];
ok(sp?.fieldId === 'speak_bp_1', 'sprechen fieldId speak_bp_1');
ok(String(sp?.situation || '').includes('Stadtfest'), 'sprechen situation from question');
ok((sp?.points || []).length >= 3, 'sprechen bullet points parsed');

if (failed) process.exit(1);
console.log('\nSpeaking scaffold tests passed.');
