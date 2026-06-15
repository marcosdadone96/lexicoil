'use strict';

const { userKey } = require('./authLib.js');

async function stripeRequest(path, { method = 'GET', body = null } = {}, secret) {
  const headers = { Authorization: `Bearer ${secret}` };
  const opts = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = body instanceof URLSearchParams ? body.toString() : body;
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Stripe error ${res.status}`);
    err.stripeCode = data.error?.code;
    throw err;
  }
  return data;
}

async function findCustomerByEmail(email, secret) {
  const q = new URLSearchParams();
  q.set('email', email);
  q.set('limit', '1');
  const data = await stripeRequest(`/customers?${q.toString()}`, {}, secret);
  return data.data?.[0]?.id || null;
}

async function persistStripeCustomerId(store, email, customerId) {
  if (!customerId || !store || !email) return;
  const key = userKey(email);
  let user = null;
  try {
    user = await store.get(key, { type: 'json' });
  } catch (_) {
    user = null;
  }
  if (!user || user.stripeCustomerId === customerId) return;
  await store.setJSON(key, { ...user, stripeCustomerId: customerId });
}

async function resolveStripeCustomerId(store, email, secret) {
  const key = userKey(email);
  let user = null;
  try {
    user = await store.get(key, { type: 'json' });
  } catch (_) {
    user = null;
  }
  if (user?.stripeCustomerId) return user.stripeCustomerId;

  const found = await findCustomerByEmail(email, secret);
  if (found) await persistStripeCustomerId(store, email, found);
  return found;
}

async function createBillingPortalSession(customerId, returnUrl, secret) {
  const params = new URLSearchParams();
  params.set('customer', customerId);
  params.set('return_url', returnUrl);
  return stripeRequest('/billing_portal/sessions', { method: 'POST', body: params }, secret);
}

function checkoutSessionIsPaid(session) {
  if (!session) return false;
  if (session.status === 'complete') {
    if (session.mode === 'subscription') return true;
    return session.payment_status === 'paid';
  }
  return session.payment_status === 'paid';
}

module.exports = {
  findCustomerByEmail,
  persistStripeCustomerId,
  resolveStripeCustomerId,
  createBillingPortalSession,
  checkoutSessionIsPaid,
};
