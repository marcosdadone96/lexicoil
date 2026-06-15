'use strict';

// LexiCoil  stripe-webhook.js
// Receives Stripe webhook events and upgrades users to Pro on payment.
// Env vars required: STRIPE_WEBHOOK_SECRET

const { getStoreForEvent } = require('./lib/blobStore.js');
const { normalizeEmail, userKey } = require('./lib/authLib.js');
const { activateProForEmail } = require('./lib/proUpgrade.js');
const { persistStripeCustomerId } = require('./lib/stripeLib.js');

function parseStripeEvent(rawBody, sigHeader, secret) {
  if (!secret) return { ok: false, error: 'missing_webhook_secret' };

  const parts = String(sigHeader || '').split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const ts = parts.t;
  const sig = parts.v1;

  if (!ts || !sig) return { ok: false, error: 'invalid_signature_header' };

  const tolerance = 5 * 60;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > tolerance) {
    return { ok: false, error: 'timestamp_too_old' };
  }

  const crypto = require('crypto');
  const signedPayload = `${ts}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(sig, 'hex');

  if (
    expectedBuf.length !== actualBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return { ok: false, error: 'signature_mismatch' };
  }

  try {
    return { ok: true, event: JSON.parse(rawBody) };
  } catch (_) {
    return { ok: false, error: 'invalid_json' };
  }
}

function getRawBody(event) {
  if (event.isBase64Encoded && typeof event.body === 'string') {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return event.body || '';
}

function extractEmail(obj) {
  return (
    obj?.metadata?.email ||
    obj?.customer_email ||
    obj?.client_reference_id ||
    null
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return { statusCode: 503, body: 'Webhook not configured' };
  }

  const rawBody = getRawBody(event);
  const sigHeader = event.headers['stripe-signature'] || event.headers['Stripe-Signature'] || '';

  const parsed = parseStripeEvent(rawBody, sigHeader, webhookSecret);
  if (!parsed.ok) {
    console.error('[stripe-webhook] Signature error:', parsed.error);
    return { statusCode: 400, body: `Webhook error: ${parsed.error}` };
  }

  const stripeEvent = parsed.event;
  const eventId = stripeEvent.id;
  console.log('[stripe-webhook] Event type:', stripeEvent.type, 'id:', eventId);

  const store = getStoreForEvent(event);
  const processedKey = `processed:${eventId}`;

  try {
    await store.get(processedKey, { type: 'json' });
    return { statusCode: 200, body: 'already processed' };
  } catch (_) {
    /* not yet processed */
  }

  let handled = false;

  try {
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data?.object;
      const rawEmail = extractEmail(session);

      if (!rawEmail) {
        console.error('[stripe-webhook] No email in session metadata');
        return { statusCode: 200, body: 'ok' };
      }

      const email = normalizeEmail(rawEmail);
      const customerId = session.customer || null;
      if (customerId) await persistStripeCustomerId(store, email, customerId);

      const result = await activateProForEmail(store, email, {
        sendEmail: true,
        stripeCustomerId: customerId || undefined,
      });
      if (!result.ok) {
        console.error('[stripe-webhook] Upgrade failed:', result.error, email);
        return { statusCode: 200, body: 'ok' };
      }

      console.log('[stripe-webhook] Upgraded to Pro:', email);
      handled = true;
    } else if (stripeEvent.type === 'customer.subscription.deleted') {
      const subscription = stripeEvent.data?.object;
      const rawEmail = extractEmail(subscription);

      if (!rawEmail) {
        console.error('[stripe-webhook] No email in subscription metadata');
        return { statusCode: 200, body: 'ok' };
      }

      const email = normalizeEmail(rawEmail);
      const key = userKey(email);
      let user = null;

      try {
        user = await store.get(key, { type: 'json' });
      } catch (_) {}

      if (!user) {
        console.error('[stripe-webhook] User not found for subscription deletion:', email);
        return { statusCode: 200, body: 'ok' };
      }

      const updatedUser = {
        ...user,
        plan: 'free',
        pro: false,
        proRevokedAt: Date.now(),
      };
      await store.setJSON(key, updatedUser);

      console.log('[stripe-webhook] Revoked Pro:', email);
      handled = true;
    }

    if (handled) {
      await store.setJSON(processedKey, { ts: Date.now() });
    }
  } catch (err) {
    console.error('[stripe-webhook] Error processing event:', err);
    return { statusCode: 500, body: 'Internal error' };
  }

  return { statusCode: 200, body: 'ok' };
};
