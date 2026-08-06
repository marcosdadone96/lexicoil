'use strict';

/**
 * Rate-limit for Via A (exam-part GET with ?words=) — abuse prevention only.
 * Not AI credits: pool lookup is cheap but unbounded scraping hits the server/blob.
 *
 * Default: 60 requests / rolling 60s per IP (and per user when authenticated).
 * One personal module assembly ≈ 3–5 GETs; 60/min allows many legitimate retries.
 */
const crypto = require('crypto');

const VOCAB_PICK_LIMIT = 60;
const VOCAB_PICK_WINDOW_MS = 60 * 1000;

function clientIp(event) {
  const raw =
    event?.headers?.['x-forwarded-for'] ||
    event?.headers?.['X-Forwarded-For'] ||
    event?.headers?.['client-ip'] ||
    '';
  return String(raw).split(',')[0].trim() || 'unknown';
}

function ipHash(ip, salt) {
  return crypto
    .createHash('sha256')
    .update(`${String(ip || 'unknown')}:${String(salt || 'lexicoil-exam-part')}`)
    .digest('hex')
    .slice(0, 20);
}

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

/**
 * Fixed-window counter in blob store (same pattern as vocab-cache PUT).
 * @returns {{ ok: boolean, remaining: number, resetAt: number, limit: number }}
 */
async function checkExamPartVocabRateLimit(store, event, opts = {}) {
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : VOCAB_PICK_LIMIT;
  const windowMs = Number(opts.windowMs) > 0 ? Number(opts.windowMs) : VOCAB_PICK_WINDOW_MS;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();

  if (!store) {
    return { ok: true, remaining: limit, resetAt: now + windowMs, limit, skipped: true };
  }

  const salt =
    process.env.GUEST_IP_SALT ||
    process.env.AUTH_JWT_SECRET ||
    process.env.LEXICOIL_JWT_SECRET ||
    'lexicoil-exam-part';

  const keys = [`ip:${ipHash(clientIp(event), salt)}`];
  const uid = optionalUserId(event);
  if (uid) keys.push(`user:${String(uid).slice(0, 64)}`);

  let worst = { ok: true, remaining: limit, resetAt: now + windowMs, limit };

  for (const suffix of keys) {
    const key = `ratelimit_exam_part_vocab:${suffix}`;
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
        continue;
      }
      worst = {
        ok: true,
        remaining: Math.max(0, limit - 1),
        resetAt: now + windowMs,
        limit,
      };
      continue;
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
    worst = {
      ok: true,
      remaining: Math.max(0, limit - entry.count),
      resetAt: Number(entry.since) + windowMs,
      limit,
    };
  }

  return worst;
}

module.exports = {
  VOCAB_PICK_LIMIT,
  VOCAB_PICK_WINDOW_MS,
  clientIp,
  ipHash,
  checkExamPartVocabRateLimit,
};
