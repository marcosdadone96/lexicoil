/**
 * Hash route parsing tests (phase 11).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routerSrc = fs.readFileSync(path.join(__dirname, '../js/bootstrap/router.js'), 'utf8');

const sandbox = {
  window: { addEventListener: () => {} },
  document: {
    getElementById: () => null,
    addEventListener: () => {},
  },
  history: { replaceState: () => {}, pushState: () => {}, back: () => {} },
  S: { goals: [{ id: 'g1', subject: 'de', level: 'B1', slug: 'de-b1' }], wsTab: 'exams', savedExams: [], history: [] },
  findGoalBySlug: (s) => sandbox.S.goals.find((g) => g.slug === s) || null,
  normalizeWsTab: (t) => (t === 'vocabulary' ? 'vocabulary' : t === 'progress' ? 'progress' : 'exams'),
  getActiveScreenId: () => null,
  gateAppRoute: () => true,
  GoalStore: { slug: (g) => g.slug },
  esc: (s) => String(s),
  console,
};
sandbox.window = sandbox;
vm.runInNewContext(routerSrc, sandbox);

const router = sandbox.window.LcRouter;
assert.ok(router, 'LcRouter loaded');

assert.equal(router.normalizeHash('#/goal/de-b1/exams'), '#/goal/de-b1/exams');

const goalExams = router.parseHash('#/goal/de-b1/exams');
assert.equal(goalExams.screen, 'goalWorkspace');
assert.equal(goalExams.tab, 'exams');

const legacy = router.parseHash('#/workspace/de-b1');
assert.equal(legacy.screen, 'goalWorkspace');

const exam = router.parseHash('#/exam/12345');
assert.equal(exam.screen, 'exam');
assert.equal(exam.examId, '12345');

const table = router.routeTable();
assert.ok(table.length >= 12, 'route table covers all screens');

console.log('OK   hash route parsing');
console.log('OK   route table (' + table.length + ' entries)');
console.log('All nav route tests passed.');
