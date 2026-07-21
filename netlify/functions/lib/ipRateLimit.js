'use strict';

const crypto = require('crypto');

function clientIp(event) {
  const raw =
    event?.headers?.['x-forwarded-for'] ||
    event?.headers?.['X-Forwarded-For'] ||
    event?.headers?.['client-ip'] ||
    '';
  return String(raw).split(',')[0].trim() || 'unknown';
}

function ipHash(event, saltSuffix = 'lexicoil-guest') {
  const ip = clientIp(event);
  const salt =
    process.env.GUEST_IP_SALT ||
    process.env.AUTH_JWT_SECRET ||
    process.env.LEXICOIL_JWT_SECRET ||
    saltSuffix;
  return crypto
    .createHash('sha256')
    .update(`${ip}:${salt}`)
    .digest('hex')
    .slice(0, 24);
}

/**
 * Fixed-window IP rate limit (login / register pattern).
 * @returns {{ ok: boolean, count: number, resetAt: number, key: string }}
 */
async function checkIpRateLimit(store, event, keyPrefix, opts = {}) {
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 10;
  const windowMs = Number(opts.windowMs) > 0 ? Number(opts.windowMs) : 15 * 60 * 1000;
  const now = Date.now();
  const key = `${keyPrefix}:${ipHash(event, keyPrefix)}`;

  if (!store) {
    return { ok: true, count: 0, resetAt: now + windowMs, key, limit };
  }

  let rl = null;
  try {
    rl = await store.get(key, { type: 'json' });
  } catch (_) {
    rl = null;
  }

  if (!rl || now >= Number(rl.resetAt || 0)) {
    return { ok: true, count: 0, resetAt: now + windowMs, key, limit };
  }

  if (Number(rl.count || 0) >= limit) {
    return { ok: false, count: rl.count, resetAt: rl.resetAt, key, limit };
  }

  return { ok: true, count: Number(rl.count || 0), resetAt: rl.resetAt, key, limit };
}

async function recordIpRateLimitHit(store, rlState) {
  if (!store || !rlState?.key) return;
  const now = Date.now();
  const resetAt = Number(rlState.resetAt) > now ? rlState.resetAt : now + (rlState.windowMs || 24 * 60 * 60 * 1000);
  const count = Number(rlState.count || 0) + 1;
  try {
    await store.setJSON(rlState.key, { count, resetAt });
  } catch (_) {
    /* ignore */
  }
}

module.exports = {
  clientIp,
  ipHash,
  checkIpRateLimit,
  recordIpRateLimitHit,
};
