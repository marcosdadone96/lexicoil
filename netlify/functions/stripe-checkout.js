'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { verifyAuthToken, userKey } = require('./lib/authLib.js');
const { corsHeaders, getBearer, jsonResponse } = require('./lib/http.js');
const { getSiteUrl } = require('./lib/siteConfig.js');

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

  const store = getStoreForEvent(event);
  let user;
  try {
    user = await store.get(userKey(auth.email), { type: 'json' });
  } catch (_) {
    user = null;
  }
  if (!user) {
    return jsonResponse(401, cors, { error: 'unauthorized' });
  }

  const origin =
    (event.headers && (event.headers.origin || event.headers.Origin)) ||
    getSiteUrl();
  const base = origin.replace(/\/$/, '');

  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('success_url', `${base}/?upgraded=1&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${base}/?cancelled=1`);
  params.set('client_reference_id', auth.email);
  params.set('customer_email', auth.email);
  params.set('metadata[email]', auth.email);
  params.set('subscription_data[metadata][email]', auth.email);
  params.append('line_items[0][quantity]', '1');
  params.append('line_items[0][price_data][currency]', 'eur');
  params.append('line_items[0][price_data][unit_amount]', '999');
  params.append('line_items[0][price_data][recurring][interval]', 'month');
  params.append(
    'line_items[0][price_data][product_data][name]',
    'LexiCoil Pro - 12 exams/month',
  );
  params.append(
    'line_items[0][price_data][product_data][description]',
    'Monthly Pro subscription: 12 exam generations/month plus personalized vocabulary practice.',
  );

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return jsonResponse(502, cors, {
      error: 'stripe_error',
      message: data.error?.message || 'Checkout failed',
    });
  }

  return jsonResponse(200, cors, { url: data.url });
};
