/**
 * A2 curated exams — free users can start without combo lock or global quota.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

process.chdir(ROOT);

const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
};

global.localStorage = localStorage;
global.window = global;
global.getMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

global.GUEST_QUOTA = 2;
global.FREE_QUOTA = 5;
global.PRO_QUOTA = 12;
global.FREE_POOL_PREVIEW = 2;
global.S = {
  plan: 'free',
  subject: 'de',
  level: 'A2',
  quotaUsed: 5,
  quotaMax: 5,
  freeCombo: { lang: 'de', level: 'B1' },
  history: [],
  user: { plan: 'free' },
};
global.Auth = { isGuest: () => false };

const LevelAvailability = require(path.join(ROOT, 'js/library/levelAvailability.js'));
global.LevelAvailability = LevelAvailability;

require(path.join(ROOT, 'js/bootstrap/freePlan.js'));
require(path.join(ROOT, 'js/bootstrap/featureQuota.js'));

assert.equal(LevelAvailability.isCuratedOnlyLevel('de', 'A2'), true);
assert.equal(canAccessCombo('de', 'A2'), true, 'free user can access A2 curated combo');
assert.equal(canAccessCombo('de', 'B2'), false, 'free user still blocked on B2 without combo');

S.quotaUsed = 5;
localStorage.setItem('lc_quota', JSON.stringify({ month: getMonthKey(), used: 5, plan: 'free' }));
assert.equal(canGenerate(), false, 'global quota exhausted');
assert.equal(canStartStandardExam('de', 'A2'), true, 'A2 curated still allowed with exhausted global quota');

S.history = [{ lang: 'de', level: 'A2', examSource: 'library', date: new Date().toLocaleDateString() }];
assert.equal(curatedStandardExamsThisMonth('de', 'A2'), 1);
assert.equal(canStartStandardExam('de', 'A2'), true, '3 curated slots left');

S.history = Array.from({ length: 4 }, (_, i) => ({
  lang: 'de',
  level: 'A2',
  examSource: 'library',
  date: new Date().toLocaleDateString(),
  id: i,
}));
assert.equal(canStartStandardExam('de', 'A2'), false, '4 curated exams used blocks 5th');

console.log('All A2 exam access tests passed.');
