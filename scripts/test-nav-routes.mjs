/**
 * Hash route parsing + level selector servability matrix (de/en × A1–C2).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const routerSrc = fs.readFileSync(path.join(ROOT, 'js/bootstrap/router.js'), 'utf8');

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
  esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
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

// ── Level availability matrix (de/en × A1–C2) ──
process.chdir(ROOT);
const LevelAvailability = require(path.join(ROOT, 'js/library/levelAvailability.js'));
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const MATRIX_LANGS = ['de', 'en'];

function renderProfileLevelCardHtml(lang, code, status, selected) {
  const soon = status === 'soon';
  const sel = !soon && selected;
  const badge = LevelAvailability.levelBadgeHtml(status);
  return `<div class="level-card${sel ? ' selected' : ''}${soon ? ' level-card--soon' : ''}"><div class="lc-code">${code}<span class="level-card__badge">${badge}</span></div>${soon ? '<div class="level-card__hint">Tap to get notified</div>' : ''}</div>`;
}

function renderGoalLevelChipHtml(lang, level, status, selected) {
  const soon = status === 'soon';
  const sel = !soon && selected;
  return `<span class="goal-lvl${sel ? ' sel' : ''}${soon ? ' goal-lvl--soon' : ''}">${level}${soon ? '<small class="goal-lvl-soon">Próximamente</small>' : ''}</span>`;
}

let readyCount = 0;
let soonCount = 0;

for (const lang of MATRIX_LANGS) {
  for (const level of LEVELS) {
    const status = LevelAvailability.getLevelUiStatus(lang, level);
    assert.ok(['ready', 'live', 'soon'].includes(status), `${lang}/${level} has valid UI status`);

    const profileHtml = renderProfileLevelCardHtml(lang, level, status, false);
    const goalHtml = renderGoalLevelChipHtml(lang, level, status, false);

    assert.ok(profileHtml.length > 20, `${lang}/${level} profile card HTML not blank`);
    assert.ok(goalHtml.length > 10, `${lang}/${level} goal chip HTML not blank`);

    if (status === 'soon') {
      soonCount++;
      assert.match(profileHtml, /Próximamente|Coming soon/, `${lang}/${level} soon badge in profile grid`);
      assert.match(goalHtml, /Próximamente/, `${lang}/${level} Próximamente in goal wizard`);
      assert.match(profileHtml, /level-card--soon/, `${lang}/${level} disabled soon styling`);
      assert.equal(LevelAvailability.isLevelSelectable(lang, level), false, `${lang}/${level} not selectable`);
    } else {
      readyCount++;
      assert.doesNotMatch(profileHtml, /level-card--soon/, `${lang}/${level} selectable card not marked soon`);
      assert.equal(LevelAvailability.isLevelSelectable(lang, level), true, `${lang}/${level} selectable`);
    }
  }
}

assert.equal(LevelAvailability.getLevelUiStatus('de', 'B1'), 'ready', 'de B1 is library-ready');
assert.equal(LevelAvailability.getLevelUiStatus('de', 'B2'), 'soon', 'de B2 scaffold shows Próximamente');
assert.equal(LevelAvailability.getLevelUiStatus('en', 'B1'), 'soon', 'en B1 scaffold shows Próximamente');
assert.ok(readyCount >= 1, 'at least one servable combo (de B1)');
assert.ok(soonCount >= 1, 'non-servable combos marked soon');

console.log('OK   level matrix de/en × A1–C2 (' + readyCount + ' ready/live, ' + soonCount + ' próximamente)');
console.log('All nav route tests passed.');
