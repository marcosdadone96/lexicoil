'use strict';

const PersonalPoolQuota = require('../../../js/library/personalPoolQuota.js');
const { requireAuth } = require('./authLib.js');
const { checkPersonalPoolQuota, incrementPersonalPoolQuota } = require('./quotaLib.js');

/**
 * Gate GET exam-part when ?words= is present (personal pool path).
 * Public pool picks (no words) skip this entirely.
 */
async function gatePersonalExamPartGet(event, store, { module, poolRequestId, wordsPresent }) {
  if (!wordsPresent) {
    return { ok: true, public: true };
  }

  const auth = await requireAuth(event, store);
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status || 401,
      error: auth.error === 'unauthorized' ? 'login_required' : (auth.error || 'login_required'),
    };
  }

  const poolMod = PersonalPoolQuota.normalizeModule(module);
  if (!poolMod) {
    return { ok: true, authenticated: true, poolModule: null };
  }

  const requestId = String(poolRequestId || '').trim();
  if (!requestId || requestId.length > 80) {
    return { ok: false, status: 400, error: 'pool_request_id_required' };
  }

  const check = await checkPersonalPoolQuota(event, poolMod);
  if (!check.ok) {
    return {
      ok: false,
      status: check.status || 429,
      error: check.error || 'personal_pool_quota_exceeded',
      module: check.module || poolMod,
      used: check.used,
      max: check.max,
      plan: check.plan,
    };
  }

  const meta = await incrementPersonalPoolQuota(check, { requestId });
  if (meta?.error === 'personal_pool_quota_exceeded') {
    return {
      ok: false,
      status: 429,
      error: 'personal_pool_quota_exceeded',
      module: meta.module || poolMod,
      used: meta.used,
      max: meta.max,
      plan: meta.plan,
    };
  }

  return {
    ok: true,
    authenticated: true,
    poolModule: poolMod,
    quotaMeta: meta,
  };
}

module.exports = { gatePersonalExamPartGet };
