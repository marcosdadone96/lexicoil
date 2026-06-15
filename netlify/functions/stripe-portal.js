'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { verifyAuthToken, normalizeEmail } = require('./lib/authLib.js');
const { corsHeaders, getBearer, jsonResponse } = require('./lib/http.js');
const { getSiteUrl } = require('./lib/siteConfig.js');
const {
  resolveStripeCustomerId,
  createBillingPortalSession,
} = require('./lib/stripeLib.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return jsonResponse(503, cors, { error: 'stripe_not_configured' });
  }

  const auth = verifyAuthToken(getBearer(event));
  if (!auth.ok) {
    return jsonResponse(401, cors, { error: 'login_required' });
  }

  const email = normalizeEmail(auth.email);
  const store = getStoreForEvent(event);

  try {
    const customerId = await resolveStripeCustomerId(store, email, secret);
    if (!customerId) {
      return jsonResponse(404, cors, {
        error: 'no_billing_account',
        message: 'No Stripe billing account found for this user.',
      });
    }

    const origin =
      (event.headers && (event.headers.origin || event.headers.Origin)) ||
      getSiteUrl();
    const returnUrl = `${origin.replace(/\/$/, '')}/`;

    const portal = await createBillingPortalSession(customerId, returnUrl, secret);
    if (!portal?.url) {
      return jsonResponse(502, cors, { error: 'portal_failed' });
    }

    return jsonResponse(200, cors, { url: portal.url });
  } catch (err) {
    console.error('[stripe-portal]', err.message);
    return jsonResponse(502, cors, {
      error: 'stripe_error',
      message: err.message || 'Could not open billing portal',
    });
  }
};
