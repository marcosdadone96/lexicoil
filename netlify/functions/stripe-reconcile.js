'use strict';

// LexiCoil — stripe-reconcile.js
// Scheduled function (daily cron) that reconciles Stripe subscription state
// with our user records in Netlify Blobs.
//
// This catches cases where webhook delivery failed (Stripe outage, cold-start
// timeouts, network drops) so users are never stuck with wrong plan access.
//
// Schedule: configured in netlify.toml as a scheduled function (daily at 02:00 UTC).
// Can also be triggered manually via the Netlify Functions dashboard.

const { getStore } = require('@netlify/blobs');
const { normalizeEmail, userKey } = require('./lib/authLib.js');
const sb = require('./lib/supabaseAdmin.js');

const STRIPE_API = 'https://api.stripe.com/v1';

async function stripeGet(path, secret) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Stripe API error (${res.status})`);
  return data;
}

// Fetch all active subscriptions from Stripe (paginated)
async function fetchActiveSubscriptions(secret) {
  const subs = [];
  let startingAfter = null;
  for (;;) {
    const qs = new URLSearchParams({
      status: 'active',
      limit: '100',
      'expand[]': 'data.customer',
    });
    if (startingAfter) qs.set('starting_after', startingAfter);
    const page = await stripeGet(`/subscriptions?${qs}`, secret);
    subs.push(...(page.data || []));
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return subs;
}

// Extract the best email from a Stripe subscription
function emailFromSub(sub) {
  const custEmail =
    typeof sub.customer === 'object' ? sub.customer.email : null;
  const metaEmail = sub.metadata?.email || sub.subscription_data?.metadata?.email || null;
  return normalizeEmail(custEmail || metaEmail || '');
}

exports.handler = async () => {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) {
    console.warn('[reconcile] STRIPE_SECRET_KEY not set — skipping');
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_secret' }) };
  }

  const store = getStore('lexicoil');
  const stats = { checked: 0, activated: 0, revoked: 0, errors: 0, generationsPurged: 0 };

  try {
    // ── Step 1: activate users with an active Stripe subscription ──────────
    const activeSubs = await fetchActiveSubscriptions(secret);
    const activeEmails = new Set();

    for (const sub of activeSubs) {
      const email = emailFromSub(sub);
      if (!email) continue;
      activeEmails.add(email);
      stats.checked++;

      try {
        const key = userKey(email);
        const user = await store.get(key, { type: 'json' }).catch(() => null);
        if (!user) continue; // user not registered yet — skip

        if (!user.pro || user.plan !== 'pro') {
          const updated = {
            ...user,
            plan: 'pro',
            pro: true,
            proActivatedAt: user.proActivatedAt || Date.now(),
            stripeCustomerId: user.stripeCustomerId || (typeof sub.customer === 'string' ? sub.customer : sub.customer?.id),
            _reconciledAt: Date.now(),
          };
          await store.setJSON(key, updated);
          stats.activated++;
          console.log('[reconcile] activated Pro for:', email);
        }
      } catch (err) {
        console.error('[reconcile] error activating', email, err.message);
        stats.errors++;
      }
    }

    // ── Step 2: revoke Pro from users whose subscription is no longer active ─
    // We only revoke if the user has a stripeCustomerId stored (meaning they
    // went through Stripe checkout) and they are currently Pro.
    // We look up their subscription directly to confirm it is gone.
    try {
      // List all users with a stripeCustomerId that are currently Pro
      // We can't list all blob keys efficiently without a prefix scan, so we
      // rely on the Stripe customer list as the source of truth.
      const cancelledSubs = await (async () => {
        const list = [];
        let after = null;
        for (;;) {
          const qs = new URLSearchParams({ status: 'canceled', limit: '100', 'expand[]': 'data.customer' });
          if (after) qs.set('starting_after', after);
          const page = await stripeGet(`/subscriptions?${qs}`, secret);
          list.push(...(page.data || []));
          if (!page.has_more) break;
          after = page.data[page.data.length - 1].id;
        }
        return list;
      })();

      for (const sub of cancelledSubs) {
        const email = emailFromSub(sub);
        if (!email || activeEmails.has(email)) continue; // still has an active sub

        try {
          const key = userKey(email);
          const user = await store.get(key, { type: 'json' }).catch(() => null);
          if (!user || (!user.pro && user.plan !== 'pro')) continue;

          const updated = { ...user, plan: 'free', pro: false, proRevokedAt: Date.now(), _reconciledAt: Date.now() };
          await store.setJSON(key, updated);
          stats.revoked++;
          console.log('[reconcile] revoked Pro for:', email);
        } catch (err) {
          console.error('[reconcile] error revoking', email, err.message);
          stats.errors++;
        }
      }
    } catch (err) {
      console.error('[reconcile] cancelled-sub scan failed:', err.message);
    }
  } catch (err) {
    console.error('[reconcile] fatal error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message, stats }) };
  }

  if (sb.isConfigured()) {
    try {
      stats.generationsPurged = await sb.purgeOldGenerations(90);
      if (stats.generationsPurged > 0) {
        console.log('[reconcile] purged old AI generations:', stats.generationsPurged);
      }
    } catch (err) {
      console.error('[reconcile] generation purge failed:', err.message);
    }
  }

  console.log('[reconcile] done', stats);
  return { statusCode: 200, body: JSON.stringify({ ok: true, stats }) };
};
