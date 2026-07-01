'use strict';

const { userKey, normalizeEmail } = require('./authLib.js');
const { getMonthKey, PRO_MAX } = require('./quotaLib.js');
const { sendProWelcomeEmail } = require('./email.js');
const { syncPlanToSupabase } = require('./planSync.js');

async function revokeProForEmail(store, rawEmail, { reason = null } = {}) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: 'invalid_email' };

  const key = userKey(email);
  let user = null;
  try {
    user = await store.get(key, { type: 'json' });
  } catch (_) {
    user = null;
  }

  if (!user) {
    return { ok: false, error: 'user_not_found', email };
  }

  const updatedUser = {
    ...user,
    plan: 'free',
    pro: false,
    proRevokedAt: Date.now(),
    paymentPastDue: false,
    paymentWarningAt: null,
    paymentWarningInvoiceId: null,
    paymentWarningStatus: null,
  };
  if (reason) updatedUser.proRevokeReason = reason;

  await store.setJSON(key, updatedUser);
  await syncPlanToSupabase(email, 'free', updatedUser);

  return { ok: true, email, user: updatedUser };
}

async function markPaymentPastDue(store, rawEmail, opts = {}) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: 'invalid_email' };

  const key = userKey(email);
  let user = null;
  try {
    user = await store.get(key, { type: 'json' });
  } catch (_) {
    user = null;
  }

  if (!user) {
    return { ok: false, error: 'user_not_found', email };
  }

  const priorInvoiceId = user.paymentWarningInvoiceId || null;
  const updatedUser = {
    ...user,
    paymentPastDue: true,
    paymentWarningAt: Date.now(),
    paymentWarningInvoiceId: opts.invoiceId || priorInvoiceId,
    paymentWarningStatus: opts.status || 'payment_failed',
  };

  await store.setJSON(key, updatedUser);
  return {
    ok: true,
    email,
    user: updatedUser,
    alreadyWarned: !!user.paymentPastDue,
    priorInvoiceId,
  };
}

async function clearPaymentPastDue(store, rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: 'invalid_email' };

  const key = userKey(email);
  let user = null;
  try {
    user = await store.get(key, { type: 'json' });
  } catch (_) {
    return { ok: false, error: 'user_not_found', email };
  }

  if (!user?.paymentPastDue) return { ok: true, email, skipped: true };

  const updatedUser = {
    ...user,
    paymentPastDue: false,
    paymentWarningAt: null,
    paymentWarningInvoiceId: null,
    paymentWarningStatus: null,
  };
  await store.setJSON(key, updatedUser);
  return { ok: true, email, user: updatedUser };
}

async function activatePlanForEmail(store, rawEmail, plan, { sendEmail = true, stripeCustomerId = null } = {}) {
  const targetPlan = plan === 'pro_max' ? 'pro_max' : 'pro';
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: 'invalid_email' };

  const key = userKey(email);
  let user = null;
  try {
    user = await store.get(key, { type: 'json' });
  } catch (_) {
    user = null;
  }

  if (!user) {
    return { ok: false, error: 'user_not_found', email };
  }

  const updatedUser = {
    ...user,
    plan: targetPlan,
    pro: true,
    proActivatedAt: Date.now(),
    paymentPastDue: false,
    paymentWarningAt: null,
    paymentWarningInvoiceId: null,
    paymentWarningStatus: null,
  };
  if (stripeCustomerId) updatedUser.stripeCustomerId = stripeCustomerId;
  await store.setJSON(key, updatedUser);

  const month = getMonthKey();
  await store.setJSON(`quota:${email}`, { used: 0, month, max: PRO_MAX });

  await syncPlanToSupabase(email, targetPlan, updatedUser);

  if (sendEmail && targetPlan === 'pro') {
    try {
      await sendProWelcomeEmail(email, updatedUser.name || email.split('@')[0]);
    } catch (err) {
      console.error('[proUpgrade] welcome email failed:', err.message);
    }
  }

  return {
    ok: true,
    email,
    user: updatedUser,
    plan: targetPlan,
    quota: { used: 0, max: PRO_MAX, month },
  };
}

async function activateProForEmail(store, rawEmail, opts = {}) {
  return activatePlanForEmail(store, rawEmail, 'pro', opts);
}

async function activateProMaxForEmail(store, rawEmail, opts = {}) {
  return activatePlanForEmail(store, rawEmail, 'pro_max', opts);
}

module.exports = {
  activateProForEmail,
  activateProMaxForEmail,
  activatePlanForEmail,
  revokeProForEmail,
  markPaymentPastDue,
  clearPaymentPastDue,
};
