/**
 * Exam quota — practice/official, Pro/Pro Max/Free, recycled, personal pool UI fields.
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
global.document = { getElementById: () => null };
global.getMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

global.GUEST_QUOTA = 2;
global.FREE_QUOTA = 5;
global.PRO_QUOTA = 12;
global.FREE_POOL_PREVIEW = 2;
global.S = {
  plan: 'pro',
  subject: 'de',
  level: 'B1',
  quotaUsed: 0,
  quotaMax: 12,
  history: [],
  user: { plan: 'pro', pro: true },
  isDemo: false,
};
global.PersonalPoolQuota = require(path.join(ROOT, 'js/library/personalPoolQuota.js'));
global.LevelAvailability = require(path.join(ROOT, 'js/library/levelAvailability.js'));
global.Auth = { isGuest: () => false };

require(path.join(ROOT, 'js/bootstrap/freePlan.js'));
require(path.join(ROOT, 'js/bootstrap/featureQuota.js'));

function libHit(recycled = false) {
  return { source: 'library', recycled, examData: { topic: 'Test' } };
}

// ── Pro: practice + official both charge (incl. recycled) ──
S.plan = 'pro';
S.user = { plan: 'pro', pro: true };
S.isDemo = false;
localStorage.setItem('lc_quota', JSON.stringify({ month: getMonthKey(), used: 0, plan: 'pro' }));
assert.equal(shouldChargeStandardExamQuota(libHit(false)), true, 'pro new library charges');
assert.equal(shouldChargeStandardExamQuota(libHit(true)), false, 'pro recycled review is free');
assert.equal(shouldChargeStandardExamQuota({ source: 'pool', recycled: false }), true, 'pro pool charges');

// ── Pro Max ──
S.plan = 'pro_max';
S.user = { plan: 'pro_max', pro: true };
localStorage.setItem('lc_quota', JSON.stringify({ month: getMonthKey(), used: 2, plan: 'pro_max' }));
assert.equal(isPaidPlan(), true, 'pro_max is paid');
assert.equal(shouldChargeStandardExamQuota(libHit(false)), true, 'pro_max library charges');
assert.equal(canStartStandardExam('de', 'B1'), true, 'pro_max under quota');

// ── Free: curated library does NOT hit server monthly quota ──
S.plan = 'free';
S.user = { plan: 'free', pro: false };
localStorage.setItem('lc_quota', JSON.stringify({ month: getMonthKey(), used: 0, plan: 'free' }));
assert.equal(shouldChargeStandardExamQuota(libHit(false)), false, 'free library no server charge');
assert.equal(shouldChargeStandardExamQuota({ source: 'ai', recycled: false }), true, 'free AI charges');

// ── applyServerQuota updates UI state + personal pool ──
applyServerQuota({
  used: 4,
  max: 12,
  plan: 'pro',
  personalLesenUsed: 3,
  personalHorenUsed: 1,
  personalLesenMax: 30,
  personalHorenMax: 30,
});
assert.equal(getQuotaUsed(), 4, 'quota used after server apply');
assert.equal(getQuotaMax(), 12, 'quota max from server');
assert.equal(S.personalLesenUsed, 3, 'personal lesen used');
assert.equal(S.personalHorenUsed, 1, 'personal horen used');

applyServerQuota({
  used: 2,
  max: 12,
  plan: 'pro_max',
  personalLesenUsed: 10,
  personalHorenUsed: 5,
});
assert.equal(S.personalLesenMax, PersonalPoolQuota.maxFor('pro_max', 'lesen'), 'pro_max personal lesen max');
assert.equal(S.personalHorenMax, PersonalPoolQuota.maxFor('pro_max', 'horen'), 'pro_max personal horen max');

// ── lc_quota hydrate on load path ──
S.quotaUsed = 0;
localStorage.setItem('lc_quota', JSON.stringify({ month: getMonthKey(), used: 7, max: 12, plan: 'pro' }));
try {
  const q = JSON.parse(localStorage.getItem('lc_quota') || '{}');
  if (q.month === getMonthKey() && typeof q.used === 'number') S.quotaUsed = q.used;
} catch (_) {}
assert.equal(getQuotaUsed(), 7, 'hydrate from lc_quota');

console.log('All exam quota mode tests passed.');
