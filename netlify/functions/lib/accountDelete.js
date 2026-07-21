'use strict';

/**
 * Full account deletion — blobs, Supabase user tables, Stripe subscription cancel.
 * Stripe customer record is retained for billing audit (GDPR: lawful basis = accounting).
 */

const crypto = require('crypto');
const { userKey, syncKey, normalizeEmail } = require('./authLib.js');

const CONFIRM_PHRASE = 'ELIMINAR';

async function listAndDeletePrefix(store, prefix) {
  if (!store?.list) return 0;
  let deleted = 0;
  let cursor;
  for (;;) {
    const page = await store.list({ prefix, cursor, directories: false });
    const blobs = page?.blobs || [];
    for (const b of blobs) {
      if (!b?.key) continue;
      try {
        await store.delete(b.key);
        deleted++;
      } catch (err) {
        console.warn('[accountDelete] blob delete failed:', b.key, err.message);
      }
    }
    if (!page?.hasMore) break;
    cursor = page.cursor;
  }
  return deleted;
}

async function cancelStripeSubscriptions(store, email, stripeCustomerId, secret) {
  const { resolveStripeCustomerId, cancelActiveSubscriptions } = require('./stripeLib.js');
  if (!secret) return { cancelled: 0, skipped: true, reason: 'no_stripe_secret' };

  let customerId = stripeCustomerId || null;
  if (!customerId && store) {
    customerId = await resolveStripeCustomerId(store, email, secret);
  }
  if (!customerId) return { cancelled: 0, skipped: true, reason: 'no_customer' };

  const { cancelled } = await cancelActiveSubscriptions(customerId, secret);
  return { cancelled, customerId };
}

async function deleteSupabaseUserData(userId, email) {
  const sb = require('./supabaseAdmin.js');
  if (!sb.isConfigured()) return { ok: true, skipped: true };

  const tables = [
    { table: 'lc_user_flashcards', col: 'user_id' },
    { table: 'lc_user_saved_exams', col: 'user_id' },
    { table: 'lc_user_history', col: 'user_id' },
    { table: 'lc_user_quota', col: 'user_id' },
    { table: 'lc_user_preferences', col: 'user_id' },
    { table: 'lc_user_burned', col: 'user_id' },
  ];

  const client = sb.getClient();
  if (!client) return { ok: false, error: 'supabase_client_unavailable' };

  const stats = {};
  for (const { table, col } of tables) {
    const { error } = await client.from(table).delete().eq(col, userId);
    stats[table] = error ? { ok: false, error: error.message } : { ok: true };
    if (error) console.error('[accountDelete] supabase delete', table, error.message);
  }

  const { error: profErr } = await client.from('lc_user_profiles').delete().eq('id', userId);
  stats.lc_user_profiles = profErr ? { ok: false, error: profErr.message } : { ok: true };

  const { error: genErr } = await client.from('lc_ai_generations').delete().or(`user_id.eq.${userId},email.eq.${email}`);
  stats.lc_ai_generations = genErr ? { ok: false, error: genErr.message } : { ok: true };

  const { error: fbErr } = await client.from('feedback').delete().eq('email', email);
  stats.feedback = fbErr ? { ok: false, error: fbErr.message } : { ok: true };

  let authDeleted = false;
  try {
    const { error: authErr } = await client.auth.admin.deleteUser(userId);
    if (!authErr) authDeleted = true;
    else if (authErr.message && !/not found|User not found/i.test(authErr.message)) {
      stats.supabase_auth = { ok: false, error: authErr.message };
    }
  } catch (err) {
    stats.supabase_auth = { ok: false, error: err.message };
  }
  stats.supabase_auth = stats.supabase_auth || { ok: authDeleted, skipped: !authDeleted };

  return { ok: true, stats };
}

async function deleteUserBlobs(store, email, userId) {
  const norm = normalizeEmail(email);
  const keys = [userKey(norm), syncKey(norm), `quota:${norm}`];
  const deleted = { direct: 0, speaking: 0, examTimer: 0 };

  for (const key of keys) {
    try {
      await store.delete(key);
      deleted.direct++;
    } catch (_) {
      /* may not exist */
    }
  }

  deleted.speaking += await listAndDeletePrefix(store, `speaking_session:${userId}:`);
  deleted.speaking += await listAndDeletePrefix(store, `speaking_live:${userId}:`);
  deleted.examTimer += await listAndDeletePrefix(store, `exam_timer:${userId}:`);

  return deleted;
}

function verifyDeleteConfirmation(phrase) {
  return String(phrase || '').trim().toUpperCase() === CONFIRM_PHRASE;
}

/**
 * @param {object} opts
 * @param {import('@netlify/blobs').Store} opts.store
 * @param {string} opts.email
 * @param {string} opts.userId
 * @param {object} [opts.user] — blob user record (stripeCustomerId, etc.)
 */
async function deleteAccountFully(opts) {
  const { store, email, userId, user } = opts;
  const norm = normalizeEmail(email);
  if (!norm || !userId) return { ok: false, error: 'invalid_identity' };

  const stripeSecret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const stripeResult = await cancelStripeSubscriptions(store, norm, user?.stripeCustomerId, stripeSecret);

  const blobResult = await deleteUserBlobs(store, norm, userId);
  const supabaseResult = await deleteSupabaseUserData(userId, norm);

  const auditKey = `account_delete_audit:${crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16)}`;
  try {
    await store.setJSON(auditKey, {
      deletedAt: Date.now(),
      emailHash: crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16),
      stripe: stripeResult,
      blobs: blobResult,
      supabase: supabaseResult.stats || {},
    });
  } catch (_) {
    /* non-fatal */
  }

  return {
    ok: true,
    email: norm,
    stripe: stripeResult,
    blobs: blobResult,
    supabase: supabaseResult,
  };
}

module.exports = {
  CONFIRM_PHRASE,
  verifyDeleteConfirmation,
  deleteAccountFully,
  cancelStripeSubscriptions,
  deleteUserBlobs,
  deleteSupabaseUserData,
};
