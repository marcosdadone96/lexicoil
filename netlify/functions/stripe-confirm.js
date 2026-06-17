'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth, normalizeEmail, signAuthToken, getTokenVersion } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, authSessionResponse, jsonResponse } = require('./lib/http.js');
const { resolvePlan, maxForPlan, getMonthKey } = require('./lib/quotaLib.js');
const { activateProForEmail } = require('./lib/proUpgrade.js');
const { checkoutSessionIsPaid, persistStripeCustomerId } = require('./lib/stripeLib.js');

function sessionEmail(session) {
  return (
    session?.metadata?.email ||
    session?.customer_email ||
    session?.client_reference_id ||
    null
  );
}

exports.handler = async (event) => {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return jsonResponse(503, cors, { error: 'stripe_not_configured' });
  }

  const store = getStoreForEvent(event);
  const auth = await requireAuth(event, store);
  if (!auth.ok) {
    return jsonResponse(auth.status || 401, cors, { error: auth.error || 'login_required' });
  }

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  const sessionId = String(body.session_id || '').trim();
  if (!sessionId) {
    return jsonResponse(400, cors, { error: 'missing_session_id' });
  }

  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${stripeSecret}` },
  });
  const session = await res.json().catch(() => ({}));
  if (!res.ok) {
    return jsonResponse(502, cors, {
      error: 'stripe_error',
      message: session.error?.message || 'Could not verify checkout session',
    });
  }

  if (!checkoutSessionIsPaid(session)) {
    return jsonResponse(402, cors, {
      error: 'payment_not_completed',
      payment_status: session.payment_status || 'unknown',
      status: session.status || 'unknown',
    });
  }

  const paidEmail = normalizeEmail(sessionEmail(session));
  const userEmail = normalizeEmail(auth.email);
  if (!paidEmail || paidEmail !== userEmail) {
    return jsonResponse(403, cors, { error: 'session_email_mismatch' });
  }

  const customerId = session.customer || null;
  if (customerId) await persistStripeCustomerId(store, userEmail, customerId);

  const upgraded = await activateProForEmail(store, userEmail, {
    sendEmail: true,
    stripeCustomerId: customerId || undefined,
  });
  if (!upgraded.ok) {
    return jsonResponse(404, cors, { error: upgraded.error || 'upgrade_failed' });
  }

  const plan = resolvePlan(upgraded.user);
  const max = maxForPlan(plan);
  const month = getMonthKey();
  const session = signAuthToken(userEmail, upgraded.user.name, getTokenVersion(upgraded.user));

  return authSessionResponse(200, cors, {
    ok: true,
    expiresAt: session.expiresAt,
    user: {
      name: upgraded.user.name,
      email: userEmail,
      plan,
      pro: plan === 'pro',
      quota: { used: 0, max, month },
      proActivatedAt: upgraded.user.proActivatedAt,
      memberSince: upgraded.user.createdAt || null,
    },
  }, session.token, event);
};
