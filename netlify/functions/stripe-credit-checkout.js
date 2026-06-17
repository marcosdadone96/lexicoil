'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth } = require('./lib/authLib.js');
const { corsHeaders, jsonResponse, parseJsonBody } = require('./lib/http.js');
const { getSiteUrl } = require('./lib/siteConfig.js');
const { CREDIT_PACKS } = require('./lib/aiCredits.js');

const PACK_PRICES = {
  50: 'STRIPE_PRICE_CREDITS_50',
  150: 'STRIPE_PRICE_CREDITS_150',
  400: 'STRIPE_PRICE_CREDITS_400',
};

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

  const pack = Number(body.pack);
  const credits = CREDIT_PACKS[pack];
  if (!credits) {
    return jsonResponse(400, cors, { error: 'invalid_pack' });
  }

  const priceEnv = PACK_PRICES[pack];
  const stripePriceId = String(process.env[priceEnv] || '').trim();
  if (!stripePriceId) {
    return jsonResponse(503, cors, { error: 'credit_pack_not_configured', pack });
  }

  const origin =
    (event.headers && (event.headers.origin || event.headers.Origin)) ||
    getSiteUrl();
  const base = origin.replace(/\/$/, '');

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${base}/?credits=1&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${base}/?cancelled=1`);
  params.set('client_reference_id', auth.email);
  params.set('customer_email', auth.email);
  params.set('metadata[kind]', 'credit_pack');
  params.set('metadata[email]', auth.email);
  params.set('metadata[credits]', String(credits));
  params.append('line_items[0][quantity]', '1');
  params.append('line_items[0][price]', stripePriceId);

  if (process.env.STRIPE_TAX_ENABLED === 'true') {
    params.set('automatic_tax[enabled]', 'true');
    params.set('billing_address_collection', 'required');
  }

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

  return jsonResponse(200, cors, { url: data.url, pack, credits });
};
