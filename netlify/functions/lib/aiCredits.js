'use strict';

const { getQuotaState, getMonthKey } = require('./quotaLib.js');
const { casWriteJson, readIdempotentResult, writeIdempotentResult } = require('./casBlob.js');
const { userKey } = require('./authLib.js');
const {
  applyMonthlyAiReset,
  computeAiRemaining,
  computeAiTotalPool,
  canAffordAiCost,
  deductAiCost,
  applyCourtesyOverdraft,
  buildQuotaPayload,
  defaultAutoRecharge,
} = require('./aiQuotaState.js');

const AI_COSTS = {
  personal_exam: 3,
  writing_correction: 1,
  grammar_coaching: 1,
  speaking: 1,
  tts: 1,
};

const CREDIT_PACKS = { 50: 50, 150: 150, 400: 400 };

function aiCreditChargeIdemKey(email, action, requestId) {
  return `ai_charge:${email}:${action}:${requestId}`;
}

function aiCreditRefundIdemKey(email, action, requestId) {
  return `ai_refund:${email}:${action}:${requestId}`;
}

function aiMaxForPlan(plan) {
  if (plan === 'pro') return Number(process.env.AI_CREDITS_PRO || 100);
  return 0;
}

async function readNormalizedQuota(state) {
  const month = getMonthKey();
  const aiMax = aiMaxForPlan(state.plan);
  let current = null;
  try {
    current = await state.store.get(state.qKey, { type: 'json' });
  } catch (_) {
    current = null;
  }
  const rec = applyMonthlyAiReset(current, aiMax, month);
  return rec;
}

function creditsResponse(rec) {
  const remaining = computeAiRemaining(rec);
  const totalPool = computeAiTotalPool(rec);
  return {
    used: rec.aiUsed,
    max: rec.aiMax,
    remaining,
    totalPool,
    rollover: rec.rollover,
    creditTopups: rec.creditTopups,
    overdraft: rec.overdraft,
    month: rec.month,
    autoRecharge: rec.autoRecharge,
  };
}

/** @returns {Promise<object>} */
async function getAiCredits(event) {
  const state = await getQuotaState(event);
  if (!state.ok || !state.authenticated) {
    return {
      used: 0,
      max: 0,
      remaining: 0,
      totalPool: 0,
      rollover: 0,
      creditTopups: 0,
      overdraft: 0,
      month: getMonthKey(),
      plan: state.plan || 'guest',
    };
  }
  const rec = await readNormalizedQuota(state);
  return { ...creditsResponse(rec), plan: state.plan, email: state.email };
}

/** Pre-flight: enough balance (or courtesy buffer). Does NOT deduct. */
async function checkAiCredits(event, action) {
  const cost = AI_COSTS[action];
  if (!cost) return { ok: false, error: 'unknown_action', remaining: 0 };
  const state = await getQuotaState(event);
  if (!state.ok) {
    if (state.error === 'token_revoked') {
      return { ok: false, error: 'token_revoked', status: 401, remaining: 0 };
    }
    return { ok: false, error: 'login_required', remaining: 0 };
  }
  if (!state.authenticated) {
    return { ok: false, error: 'login_required', remaining: 0 };
  }
  if (state.plan !== 'pro') {
    return { ok: false, error: 'pro_only', remaining: 0, plan: state.plan };
  }

  const rec = await readNormalizedQuota(state);
  const afford = canAffordAiCost(rec, cost);
  if (!afford.ok) {
    const auto = await attemptAutoRecharge(event, state, rec);
    if (auto.ok && auto.retried) {
      const rec2 = await readNormalizedQuota(state);
      const afford2 = canAffordAiCost(rec2, cost);
      if (afford2.ok) {
        return {
          ok: true,
          remaining: afford2.remaining - cost,
          max: rec2.aiMax,
          used: rec2.aiUsed,
          cost,
          email: state.email,
          totalPool: computeAiTotalPool(rec2),
        };
      }
    }
    if (auto.autoRechargeFailed) {
      return {
        ok: false,
        error: 'ai_credits_exhausted',
        autoRechargeFailed: true,
        reason: auto.reason || 'authentication_required',
        remaining: afford.remaining,
        max: rec.aiMax,
        used: rec.aiUsed,
        cost,
      };
    }
    return {
      ok: false,
      error: 'ai_credits_exhausted',
      remaining: afford.remaining,
      max: rec.aiMax,
      used: rec.aiUsed,
      cost,
    };
  }

  return {
    ok: true,
    remaining: afford.remaining - cost,
    max: rec.aiMax,
    used: rec.aiUsed,
    cost,
    email: state.email,
    useOverdraft: afford.useOverdraft,
    totalPool: computeAiTotalPool(rec),
  };
}

/** Deduct credits before or after a successful AI response (atomic CAS + optional idempotency). */
async function confirmAiCreditConsumption(event, action, opts = {}) {
  const cost = AI_COSTS[action];
  if (!cost) return null;
  const state = await getQuotaState(event);
  if (!state.ok || !state.authenticated || state.plan !== 'pro') return null;
  const month = getMonthKey();
  const aiMax = aiMaxForPlan(state.plan);
  const requestId = opts.requestId || null;

  if (requestId) {
    const chargeIdemKey = aiCreditChargeIdemKey(state.email, action, requestId);
    const prior = await readIdempotentResult(state.store, chargeIdemKey);
    if (prior) return prior;
  }

  const result = await casWriteJson(
    state.store,
    state.qKey,
    (current) => {
      let rec = applyMonthlyAiReset(current, aiMax, month);
      const before = {
        aiUsed: rec.aiUsed,
        rollover: rec.rollover,
        creditTopups: rec.creditTopups,
        overdraft: rec.overdraft,
      };
      const afford = canAffordAiCost(rec, cost);
      if (!afford.ok) {
        return {
          skip: true,
          result: {
            error: 'ai_credits_exhausted',
            aiUsed: rec.aiUsed,
            aiMax: rec.aiMax,
            remaining: computeAiRemaining(rec),
          },
        };
      }

      if (afford.useOverdraft) {
        rec = applyCourtesyOverdraft(rec, cost);
      } else {
        const deducted = deductAiCost(rec, cost);
        if (deducted.error) {
          return {
            skip: true,
            result: {
              error: deducted.error,
              aiUsed: rec.aiUsed,
              aiMax: rec.aiMax,
              remaining: computeAiRemaining(rec),
            },
          };
        }
        rec = { ...rec, ...deducted };
      }

      const remaining = computeAiRemaining(rec);
      return {
        payload: buildQuotaPayload(rec),
        result: {
          aiUsed: rec.aiUsed,
          aiMax: rec.aiMax,
          aiRemaining: remaining,
          remaining,
          rollover: rec.rollover,
          creditTopups: rec.creditTopups,
          overdraft: rec.overdraft,
          totalPool: computeAiTotalPool(rec),
          before,
          cost,
          action,
        },
      };
    },
    { logTag: '[ai-credits-cas]' },
  );

  if (requestId && result && !result.error) {
    const chargeIdemKey = aiCreditChargeIdemKey(state.email, action, requestId);
    return writeIdempotentResult(state.store, chargeIdemKey, result);
  }
  return result;
}

/** Refund AI credits after a failed call that already charged (CAS + idempotent by requestId). */
async function releaseAiCreditConsumption(event, action, opts = {}) {
  const cost = AI_COSTS[action];
  if (!cost) return null;
  const requestId = opts.requestId || null;
  if (!requestId) return { skipped: true, reason: 'no_request_id' };

  const state = await getQuotaState(event);
  if (!state.ok || !state.authenticated || state.plan !== 'pro') return null;
  const month = getMonthKey();
  const aiMax = aiMaxForPlan(state.plan);

  const refundIdemKey = aiCreditRefundIdemKey(state.email, action, requestId);
  const priorRefund = await readIdempotentResult(state.store, refundIdemKey);
  if (priorRefund) return priorRefund;

  const chargeIdemKey = aiCreditChargeIdemKey(state.email, action, requestId);
  const chargeRecord = await readIdempotentResult(state.store, chargeIdemKey);
  if (!chargeRecord || chargeRecord.error || !chargeRecord.before) {
    return { skipped: true, reason: 'no_charge' };
  }

  const result = await casWriteJson(
    state.store,
    state.qKey,
    (current) => {
      const rec = applyMonthlyAiReset(current, aiMax, month);
      const restored = {
        ...rec,
        aiUsed: chargeRecord.before.aiUsed,
        rollover: chargeRecord.before.rollover,
        creditTopups: chargeRecord.before.creditTopups,
        overdraft: chargeRecord.before.overdraft,
      };
      const remaining = computeAiRemaining(restored);
      return {
        payload: buildQuotaPayload(restored),
        result: {
          aiUsed: restored.aiUsed,
          aiMax: restored.aiMax,
          aiRemaining: remaining,
          remaining,
          rollover: restored.rollover,
          creditTopups: restored.creditTopups,
          overdraft: restored.overdraft,
          totalPool: computeAiTotalPool(restored),
          refunded: true,
          action,
        },
      };
    },
    { logTag: '[ai-credits-refund-cas]' },
  );

  const written = await writeIdempotentResult(state.store, refundIdemKey, result);
  try {
    await state.store.delete(chargeIdemKey);
  } catch (_) {
    /* non-fatal */
  }
  return written;
}

/** Idempotent credit pack top-up (Stripe webhook + auto-recharge). */
async function addCreditTopups(store, email, credits, idempotencyKey) {
  const amount = Math.max(0, Math.floor(Number(credits) || 0));
  if (!amount || !email) return { ok: false, error: 'invalid_credits' };

  const idemKey = `credit_pack:${idempotencyKey || 'unknown'}`;
  const prior = await readIdempotentResult(store, idemKey);
  if (prior) return { ok: true, ...prior, duplicate: true };

  const qKey = `quota:${email}`;
  const month = getMonthKey();
  const aiMax = aiMaxForPlan('pro');

  const result = await casWriteJson(
    store,
    qKey,
    (current) => {
      const rec = applyMonthlyAiReset(current, aiMax, month);
      const creditTopups = (Number(rec.creditTopups) || 0) + amount;
      const updated = { ...rec, creditTopups };
      return {
        payload: buildQuotaPayload(updated),
        result: {
          ok: true,
          added: amount,
          creditTopups,
          remaining: computeAiRemaining(updated),
        },
      };
    },
    { logTag: '[credit-pack]' },
  );

  await writeIdempotentResult(store, idemKey, result);
  return { ok: true, ...result };
}

async function setAutoRechargeEnabled(store, email, enabled) {
  const qKey = `quota:${email}`;
  const month = getMonthKey();
  const aiMax = aiMaxForPlan('pro');

  return casWriteJson(
    store,
    qKey,
    (current) => {
      const rec = applyMonthlyAiReset(current, aiMax, month);
      const autoRecharge = {
        ...defaultAutoRecharge(),
        ...(rec.autoRecharge || {}),
        enabled: !!enabled,
      };
      const updated = { ...rec, autoRecharge };
      return {
        payload: buildQuotaPayload(updated),
        result: { ok: true, autoRecharge },
      };
    },
    { logTag: '[auto-recharge-pref]' },
  );
}

async function getStripeCustomerDefaultPaymentMethod(customerId, secret) {
  const custRes = await fetch(
    `https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}?expand[]=invoice_settings.default_payment_method`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  const customer = await custRes.json().catch(() => ({}));
  if (!custRes.ok) return null;
  const pm = customer.invoice_settings?.default_payment_method;
  if (typeof pm === 'object' && pm?.id) return pm.id;
  if (typeof pm === 'string') return pm;

  const listRes = await fetch(
    `https://api.stripe.com/v1/payment_methods?customer=${encodeURIComponent(customerId)}&type=card&limit=1`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  const list = await listRes.json().catch(() => ({}));
  return list.data?.[0]?.id || null;
}

/** Opt-in off-session auto-recharge when balance exhausted. Credits arrive via webhook. */
async function attemptAutoRecharge(event, state, rec) {
  const ar = rec.autoRecharge || defaultAutoRecharge();
  if (!ar.enabled || (Number(ar.usedThisMonth) || 0) >= (Number(ar.maxPerMonth) || 2)) {
    return { ok: false };
  }

  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) return { ok: false };

  let user = null;
  try {
    user = await state.store.get(userKey(state.email), { type: 'json' });
  } catch (_) {
    return { ok: false };
  }
  const customerId = user?.stripeCustomerId;
  if (!customerId) return { ok: false };

  const paymentMethod = await getStripeCustomerDefaultPaymentMethod(customerId, secret);
  if (!paymentMethod) return { ok: false };

  const pack = Number(ar.pack) || 50;
  const priceEnv = {
    50: process.env.STRIPE_PRICE_CREDITS_50,
    150: process.env.STRIPE_PRICE_CREDITS_150,
    400: process.env.STRIPE_PRICE_CREDITS_400,
  }[pack];
  if (!priceEnv) return { ok: false };

  const priceRes = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceEnv)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const price = await priceRes.json().catch(() => ({}));
  const amount = Number(price.unit_amount);
  if (!amount) return { ok: false };

  const piParams = new URLSearchParams();
  piParams.set('amount', String(amount));
  piParams.set('currency', String(price.currency || 'eur'));
  piParams.set('customer', customerId);
  piParams.set('payment_method', paymentMethod);
  piParams.set('off_session', 'true');
  piParams.set('confirm', 'true');
  piParams.set('metadata[kind]', 'credit_pack');
  piParams.set('metadata[email]', state.email);
  piParams.set('metadata[credits]', String(pack));

  const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: piParams.toString(),
  });
  const pi = await piRes.json().catch(() => ({}));

  if (!piRes.ok) {
    const code = pi.error?.code || pi.error?.decline_code || '';
    if (code === 'authentication_required' || pi.status === 'requires_action') {
      return { ok: false, autoRechargeFailed: true, reason: 'authentication_required' };
    }
    return { ok: false, autoRechargeFailed: true, reason: code || 'payment_failed' };
  }

  if (pi.status === 'requires_action') {
    return { ok: false, autoRechargeFailed: true, reason: 'authentication_required' };
  }

  await casWriteJson(
    state.store,
    state.qKey,
    (current) => {
      const month = getMonthKey();
      const aiMax = aiMaxForPlan('pro');
      const norm = applyMonthlyAiReset(current, aiMax, month);
      const autoRecharge = {
        ...defaultAutoRecharge(),
        ...(norm.autoRecharge || {}),
        usedThisMonth: (Number(norm.autoRecharge?.usedThisMonth) || 0) + 1,
      };
      return {
        payload: buildQuotaPayload({ ...norm, autoRecharge }),
        result: { ok: true },
      };
    },
    { logTag: '[auto-recharge-count]' },
  );

  if (pi.status === 'succeeded') {
    await addCreditTopups(state.store, state.email, pack, pi.id);
    return { ok: true, retried: true };
  }

  return { ok: false };
}

module.exports = {
  AI_COSTS,
  CREDIT_PACKS,
  aiMaxForPlan,
  aiCreditChargeIdemKey,
  aiCreditRefundIdemKey,
  getAiCredits,
  checkAiCredits,
  confirmAiCreditConsumption,
  releaseAiCreditConsumption,
  addCreditTopups,
  setAutoRechargeEnabled,
  attemptAutoRecharge,
  readNormalizedQuota,
  creditsResponse,
};
