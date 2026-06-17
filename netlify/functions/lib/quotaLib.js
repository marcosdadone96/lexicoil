'use strict';

// LexiCoil — quotaLib.js
// Server-side quota management using Netlify Blobs (CAS + idempotency).

const crypto        = require('crypto');
const { getStoreForEvent } = require('./blobStore.js');
const { casWriteJson, readIdempotentResult, writeIdempotentResult } = require('./casBlob.js');
const { verifyAuthToken, userKey } = require('./authLib.js');
const { getBearer }  = require('./http.js');
const { applyMonthlyAiReset, buildQuotaPayload } = require('./aiQuotaState.js');

const GUEST_MAX     = 2;
const FREE_MAX      = 5;
const PRO_MAX       = 12;
const GUEST_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

function getMonthKey() {
  const d = new Date();
  // B-5 fix: zero-pad month so keys match YYYY-MM format (getMonth() is 0-indexed)
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}

function hashIp(ip) {
  // A-3 fix: use a dedicated salt so rotating AUTH_JWT_SECRET doesn't reset guest quotas
  const salt = process.env.GUEST_IP_SALT || process.env.AUTH_JWT_SECRET || process.env.LEXICOIL_JWT_SECRET || 'lexicoil-guest';
  return crypto.createHash('sha256').update(`${ip}:${salt}`).digest('hex').slice(0, 32);
}

function getClientIp(event) {
  const fwd =
    (event.headers &&
      (event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'])) || '';
  const ip = String(fwd).split(',')[0].trim();
  return ip || 'unknown';
}

async function loadUser(store, email) {
  try {
    return await store.get(userKey(email), { type: 'json' });
  } catch (_) {
    return null;
  }
}

function resolvePlan(user) {
  if (!user) return 'free';
  if (user.pro || user.plan === 'pro') return 'pro';
  return 'free';
}

function maxForPlan(plan) {
  if (plan === 'pro')   return PRO_MAX;
  if (plan === 'guest') return GUEST_MAX;
  return FREE_MAX;
}

// Returns full quota state object � used by checkQuota and incrementQuota
async function getQuotaState(event) {
  const store = getStoreForEvent(event);
  const token = getBearer(event);
  const auth  = token ? verifyAuthToken(token) : { ok: false };

  if (auth.ok) {
    const user = await loadUser(store, auth.email);
    if (!user) return { ok: false, error: 'unauthorized', status: 401 };
    if (user.tokenVersion != null && auth.payload.tv !== user.tokenVersion) {
      return { ok: false, error: 'token_revoked', status: 401 };
    }

    const plan  = resolvePlan(user);
    const month = getMonthKey();
    const qKey  = `quota:${auth.email}`;
    let used = 0;
    const max = maxForPlan(plan);
    try {
      const q = await store.get(qKey, { type: 'json' });
      if (q && q.month === month) used = Number(q.used) || 0;
    } catch (_) { /* fresh user */ }

    return {
      ok: true,
      authenticated: true,
      email: auth.email,
      plan,
      used,
      max,
      month,
      store,
      qKey,
    };
  }

  // Guest � identified by IP hash
  const ipHash = hashIp(getClientIp(event));
  const gKey   = `guest_quota:${ipHash}`;
  let used = 0;
  let expiresAt = 0;
  try {
    const g = await store.get(gKey, { type: 'json' });
    if (g) {
      expiresAt = g.expiresAt || 0;
      used = (expiresAt && Date.now() > expiresAt) ? 0 : (Number(g.used) || 0);
    }
  } catch (_) { /* fresh guest */ }

  return {
    ok: true,
    authenticated: false,
    plan: 'guest',
    used,
    max: GUEST_MAX,
    store,
    gKey,
    ipHash,
    expiresAt,
  };
}

// Returns { ok, used, max, plan, state } or { ok:false, status, error, ... }
async function checkQuota(event) {
  const state = await getQuotaState(event);
  if (!state.ok) {
    return {
      ok: false,
      status: state.status || (state.error === 'token_revoked' || state.error === 'unauthorized' ? 401 : 403),
      error: state.error || 'unauthorized',
    };
  }

  const cappedUsed = Math.min(Number(state.used) || 0, state.max);

  if (cappedUsed >= state.max) {
    return {
      ok:     false,
      status: 429,
      error:  'quota_exceeded',
      used:   cappedUsed,
      max:    state.max,
      plan:   state.plan,
    };
  }

  return {
    ok:    true,
    used:  state.used,
    max:   state.max,
    plan:  state.plan,
    state,
  };
}

function quotaIdemKey(scopeKey, requestId) {
  return `${scopeKey}:idem:${requestId}`;
}

function quotaRefundIdemKey(scopeKey, requestId) {
  return `${scopeKey}:idem:refund:${requestId}`;
}

// Call after a successful AI generation to persist the new count (CAS + optional idempotency).
async function incrementQuota(quotaCheck, opts = {}) {
  if (!quotaCheck) return null;
  const s = quotaCheck.state || quotaCheck;
  if (!s || !s.ok || !s.store) return null;

  const scopeKey = s.authenticated ? s.qKey : s.gKey;
  const requestId = opts.requestId || s.requestId || null;
  const month = getMonthKey();

  if (requestId) {
    const idemKey = quotaIdemKey(scopeKey, requestId);
    const prior = await readIdempotentResult(s.store, idemKey);
    if (prior) return prior;
  }

  const result = await casWriteJson(
    s.store,
    scopeKey,
    (current) => {
      let used = 0;
      let expiresAt = s.expiresAt;

      if (s.authenticated) {
        if (current && current.month === month) {
          used = Number(current.used) || 0;
        }
      } else if (current) {
        expiresAt = current.expiresAt || s.expiresAt;
        used =
          expiresAt && Date.now() > expiresAt ? 0 : Number(current.used) || 0;
      }

      const cappedUsed = Math.min(used, s.max);
      if (cappedUsed >= s.max) {
        return {
          skip: true,
          result: {
            used: cappedUsed,
            max: s.max,
            plan: s.plan,
            error: 'quota_exceeded',
          },
        };
      }

      const newUsed = cappedUsed + 1;
      const version = (current?.version || 0) + 1;
      const aiMax =
        s.authenticated && s.plan === 'pro'
          ? Number(process.env.AI_CREDITS_PRO || 100)
          : 0;

      if (s.authenticated) {
        const normalized = applyMonthlyAiReset(current, aiMax, month);
        const payload = buildQuotaPayload({ ...normalized, used: newUsed }, true);
        return {
          payload,
          result: {
            used: newUsed,
            max: s.max,
            plan: s.plan,
          },
        };
      }

      const payload = {
        used: newUsed,
        createdAt: current?.createdAt || Date.now(),
        expiresAt: expiresAt || Date.now() + GUEST_TTL_SEC * 1000,
        version,
      };

      return {
        payload,
        result: {
          used: newUsed,
          max: s.max,
          plan: s.authenticated ? s.plan : 'guest',
        },
      };
    },
    { logTag: '[quota-cas]' },
  );

  if (requestId) {
    const idemKey = quotaIdemKey(scopeKey, requestId);
    return writeIdempotentResult(s.store, idemKey, result);
  }
  return result;
}

// Refund one exam quota unit after a failed AI call (CAS + optional idempotency).
async function decrementQuota(quotaCheck, opts = {}) {
  if (!quotaCheck) return null;
  const s = quotaCheck.state || quotaCheck;
  if (!s || !s.ok || !s.store) return null;

  const scopeKey = s.authenticated ? s.qKey : s.gKey;
  const requestId = opts.requestId || null;
  const month = getMonthKey();

  if (requestId) {
    const refundIdemKey = quotaRefundIdemKey(scopeKey, requestId);
    const priorRefund = await readIdempotentResult(s.store, refundIdemKey);
    if (priorRefund) return priorRefund;

    const incIdemKey = quotaIdemKey(scopeKey, requestId);
    const incPrior = await readIdempotentResult(s.store, incIdemKey);
    if (!incPrior) {
      return { skipped: true, reason: 'no_increment', used: s.used, max: s.max, plan: s.plan };
    }
  }

  const result = await casWriteJson(
    s.store,
    scopeKey,
    (current) => {
      let used = 0;
      let expiresAt = s.expiresAt;

      if (s.authenticated) {
        if (current && current.month === month) {
          used = Number(current.used) || 0;
        }
      } else if (current) {
        expiresAt = current.expiresAt || s.expiresAt;
        used =
          expiresAt && Date.now() > expiresAt ? 0 : Number(current.used) || 0;
      }

      const newUsed = Math.max(0, Math.min(used, s.max) - 1);
      const version = (current?.version || 0) + 1;
      const aiMax =
        s.authenticated && s.plan === 'pro'
          ? Number(process.env.AI_CREDITS_PRO || 100)
          : 0;

      if (s.authenticated) {
        const normalized = applyMonthlyAiReset(current, aiMax, month);
        const payload = buildQuotaPayload({ ...normalized, used: newUsed }, true);
        return {
          payload,
          result: {
            used: newUsed,
            max: s.max,
            plan: s.plan,
            refunded: true,
          },
        };
      }

      const payload = {
        used: newUsed,
        createdAt: current?.createdAt || Date.now(),
        expiresAt: expiresAt || Date.now() + GUEST_TTL_SEC * 1000,
        version,
      };

      return {
        payload,
        result: {
          used: newUsed,
          max: s.max,
          plan: 'guest',
          refunded: true,
        },
      };
    },
    { logTag: '[quota-refund-cas]' },
  );

  if (requestId) {
    const refundIdemKey = quotaRefundIdemKey(scopeKey, requestId);
    const written = await writeIdempotentResult(s.store, refundIdemKey, result);
    try {
      await s.store.delete(quotaIdemKey(scopeKey, requestId));
    } catch (_) {
      /* non-fatal — retry may skip re-charge until idem expires */
    }
    return written;
  }
  return result;
}

module.exports = {
  GUEST_MAX,
  FREE_MAX,
  PRO_MAX,
  getMonthKey,
  getQuotaState,
  checkQuota,
  incrementQuota,
  decrementQuota,
  quotaIdemKey,
  quotaRefundIdemKey,
  maxForPlan,
  resolvePlan,
};
