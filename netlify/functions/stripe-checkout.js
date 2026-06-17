'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth } = require('./lib/authLib.js');
const { corsHeaders, jsonResponse } = require('./lib/http.js');
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

  const store = getStoreForEvent(event);
  // B-2 fix: requireAuth also checks tokenVersion so a revoked token can't start a checkout
  const auth = await requireAuth(event, store);
  if (!auth.ok) {
    return jsonResponse(auth.status || 401, cors, { error: auth.error || 'login_required' });
  }
  const { email: authEmail, user } = auth;

  const origin =
    (event.headers && (event.headers.origin || event.headers.Origin)) ||
    getSiteUrl();
  const base = origin.replace(/\/$/, '');

  // E-4 fix: prefer a pre-created Stripe Price ID (set STRIPE_PRICE_ID in env).
  // This avoids re-creating a product on every checkout and allows price changes
  // without a code deploy. Falls back to inline price_data for backward compatibility.
  const stripePriceId = String(process.env.STRIPE_PRICE_ID || '').trim();

  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('success_url', `${base}/?upgraded=1&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${base}/?cancelled=1`);
  params.set('client_reference_id', authEmail);
  params.set('customer_email', authEmail);
  params.set('metadata[email]', authEmail);
  params.set('subscription_data[metadata][email]', authEmail);
  params.append('line_items[0][quantity]', '1');

  if (stripePriceId) {
    // Use the pre-created Price — clean, version-controlled via env
    params.append('line_items[0][price]', stripePriceId);
  } else {
    // Fallback: inline price_data (no STRIPE_PRICE_ID set)
    params.append('line_items[0][price_data][currency]', 'eur');
    params.append('line_items[0][price_data][unit_amount]', '999');
    params.append('line_items[0][price_data][recurring][interval]', 'month');
    params.append('line_items[0][price_data][product_data][name]', 'LexiCoil Pro - 12 exams/month');
    params.append(
      'line_items[0][price_data][product_data][description]',
      'Monthly Pro subscription: 12 exam generations/month plus personalized vocabulary practice.',
    );
  }

  // E-4 fix: Stripe Tax — enable automatic EU VAT collection.
  // Requires Stripe Tax to be activated in your Stripe Dashboard first.
  // Set STRIPE_TAX_ENABLED=true in Netlify env when ready to activate.
  if (process.env.STRIPE_TAX_ENABLED === 'true') {
    params.set('automatic_tax[enabled]', 'true');
    // Collect billing address so Stripe Tax can determine the customer's country
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

  return jsonResponse(200, cors, { url: data.url });
};
