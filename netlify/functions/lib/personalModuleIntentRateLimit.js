'use strict';

/**
 * Rate-limit personal planModule / suggest intents — 12 per authenticated user per hour (§8.3).
 */
const crypto = require('crypto');

const PERSONAL_MODULE_INTENT_LIMIT = 12;
const PERSONAL_MODULE_INTENT_WINDOW_MS = 60 * 60 * 1000;

function optionalUserId(event) {
  try {
    const { getBearer } = require('./http.js');
    const { verifyAuthToken } = require('./authLib.js');
    const token = getBearer(event);
    if (!token) return null;
    const auth = verifyAuthToken(token);
    return auth?.ok ? auth.userId || auth.email || null : null;
  } catch (_) {
    return null;
  }
}

async function checkPersonalModuleIntentRateLimit(store, event, opts = {}) {
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : PERSONAL_MODULE_INTENT_LIMIT;
  const windowMs =
    Number(opts.windowMs) > 0 ? Number(opts.windowMs) : PERSONAL_MODULE_INTENT_WINDOW_MS;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const uid = optionalUserId(event);
  if (!uid || !store) {
    return { ok: true, remaining: limit, resetAt: now + windowMs, limit, skipped: !uid };
  }

  const key = `ratelimit_personal_module_intent:user:${String(uid).slice(0, 64)}`;
  let entry = null;
  try {
    entry = await store.get(key, { type: 'json' });
  } catch (_) {
    entry = null;
  }

  if (!entry || now - Number(entry.since || 0) > windowMs) {
    entry = { count: 1, since: now };
    try {
      await store.setJSON(key, entry);
    } catch (_) {
      /* fail-open */
    }
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt: now + windowMs, limit };
  }

  if (entry.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: Number(entry.since) + windowMs,
      limit,
    };
  }

  entry.count += 1;
  try {
    await store.setJSON(key, entry);
  } catch (_) {
    /* fail-open */
  }
  return {
    ok: true,
    remaining: Math.max(0, limit - entry.count),
    resetAt: Number(entry.since) + windowMs,
    limit,
  };
}

module.exports = {
  PERSONAL_MODULE_INTENT_LIMIT,
  PERSONAL_MODULE_INTENT_WINDOW_MS,
  checkPersonalModuleIntentRateLimit,
};
