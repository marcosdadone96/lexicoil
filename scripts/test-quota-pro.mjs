import assert from 'assert';

// Mirror server quota max logic after fix
const PRO_MAX = 12;
const FREE_MAX = 5;

function maxForPlan(plan) {
  if (plan === 'pro') return PRO_MAX;
  if (plan === 'guest') return 2;
  return FREE_MAX;
}

function resolveMaxFromQuotaBlob(plan, q) {
  const max = maxForPlan(plan);
  let used = 0;
  const month = '2026-5';
  if (q && q.month === month) used = Number(q.used) || 0;
  return { used, max, plan };
}

// Pro user with stale q.max=2 in blob must still get 12
{
  const r = resolveMaxFromQuotaBlob('pro', { used: 3, month: '2026-5', max: 2 });
  assert.strictEqual(r.max, 12, 'Pro max must be 12 even if blob has max:2');
  assert.strictEqual(r.used, 3);
}

// Free user gets 5
{
  const r = resolveMaxFromQuotaBlob('free', { used: 1, month: '2026-5', max: 2 });
  assert.strictEqual(r.max, 5);
}

// Client applyServerQuota mirror
function applyServerQuotaClient(data, S) {
  if (typeof data.used === 'number') S.quotaUsed = data.used;
  if (data.plan) S.plan = data.plan;
  const PRO_QUOTA = 12;
  const FREE_QUOTA = 5;
  if (S.plan === 'pro') S.quotaMax = PRO_QUOTA;
  else if (S.plan === 'guest') S.quotaMax = 2;
  else if (typeof data.max === 'number') S.quotaMax = data.max;
  else S.quotaMax = FREE_QUOTA;
  return S;
}

{
  const S = applyServerQuotaClient({ used: 0, max: 2, plan: 'pro' }, {});
  assert.strictEqual(S.quotaMax, 12, 'Client must force 12 for pro');
  assert.strictEqual(S.plan, 'pro');
}

console.log('All quota Pro activation checks passed.');
