/**
 * Pro B1 — library exams must count against monthly quota (used/max UI + server blob).
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
  plan: 'pro',
  subject: 'de',
  level: 'B1',
  quotaUsed: 0,
  quotaMax: 12,
  history: [],
  user: { plan: 'pro', pro: true },
  isDemo: false,
};
global.Auth = { isGuest: () => false };
global.document = { getElementById: () => null };

const LevelAvailability = require(path.join(ROOT, 'js/library/levelAvailability.js'));
global.LevelAvailability = LevelAvailability;

require(path.join(ROOT, 'js/bootstrap/freePlan.js'));
require(path.join(ROOT, 'js/bootstrap/featureQuota.js'));

assert.equal(canStartStandardExam('de', 'B1'), true, 'pro with 0/12 can start');
S.quotaUsed = 12;
localStorage.setItem('lc_quota', JSON.stringify({ month: getMonthKey(), used: 12, plan: 'pro' }));
assert.equal(canStartStandardExam('de', 'B1'), false, 'pro at 12/12 blocked');

S.quotaUsed = 0;
localStorage.setItem('lc_quota', JSON.stringify({ month: getMonthKey(), used: 0, plan: 'pro' }));
assert.equal(
  shouldChargeStandardExamQuota({ source: 'library', recycled: false }),
  true,
  'pro library hit charges quota',
);
assert.equal(
  shouldChargeStandardExamQuota({ source: 'library', recycled: true }),
  false,
  'pro recycled library review does not charge',
);
assert.equal(
  shouldChargeStandardExamQuota({ source: 'pool', recycled: false }),
  true,
  'pro pool hit charges quota',
);

S.plan = 'free';
S.user = { plan: 'free', pro: false };
localStorage.setItem('lc_quota', JSON.stringify({ month: getMonthKey(), used: 0, plan: 'free' }));
assert.equal(
  shouldChargeStandardExamQuota({ source: 'library', recycled: false }),
  false,
  'free curated library uses preview slots, not server quota',
);
assert.equal(
  shouldChargeStandardExamQuota({ source: 'ai', recycled: false }),
  true,
  'free AI path still charges global quota',
);

applyServerQuota({ used: 3, max: 12, plan: 'pro' });
assert.equal(getQuotaUsed(), 3, 'applyServerQuota updates used for UI');
assert.equal(getQuotaMax() - getQuotaUsed(), 9, 'account panel would show 9 of 12 left');

console.log('All B1 Pro quota tests passed.');
