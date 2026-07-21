'use strict';

const { randomBytes } = require('crypto');
const { normalizeEmail, userKey } = require('./authLib.js');
const { sendSignupConfirmationEmail } = require('./email.js');
const { getSiteUrl } = require('./siteConfig.js');

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

function skipEmailVerify() {
  return String(process.env.AUTH_SKIP_EMAIL_VERIFY || '').trim() === '1';
}

function isEmailVerified(user) {
  if (!user) return false;
  if (user.emailVerified === false) return false;
  return true;
}

async function createEmailVerifyToken(store, email) {
  const token = randomBytes(24).toString('hex');
  const exp = Date.now() + VERIFY_TTL_MS;
  await store.setJSON(`verify:${token}`, { email: normalizeEmail(email), exp }, { metadata: { ttl: 86400 } });
  return token;
}

async function sendUserVerifyEmail(email, name, token) {
  const verifyUrl = `${getSiteUrl()}/.netlify/functions/auth-verify-email?token=${token}`;
  return sendSignupConfirmationEmail(email, name, verifyUrl);
}

async function verifyEmailToken(store, token) {
  const raw = String(token || '').trim();
  if (!raw) return { ok: false, error: 'invalid_or_expired_token' };

  let row = null;
  try {
    row = await store.get(`verify:${raw}`, { type: 'json' });
  } catch (_) {
    row = null;
  }

  if (!row?.email || (row.exp && Date.now() > row.exp)) {
    return { ok: false, error: 'invalid_or_expired_token' };
  }

  const email = normalizeEmail(row.email);
  const key = userKey(email);
  let user = null;
  try {
    user = await store.get(key, { type: 'json' });
  } catch (_) {
    user = null;
  }

  if (!user) {
    return { ok: false, error: 'user_not_found' };
  }

  if (isEmailVerified(user)) {
    try {
      await store.delete(`verify:${raw}`);
    } catch (_) {
      /* ignore */
    }
    return { ok: true, email, alreadyVerified: true };
  }

  await store.setJSON(key, {
    ...user,
    emailVerified: true,
    emailVerifiedAt: Date.now(),
    emailVerifyToken: null,
  });

  try {
    await store.delete(`verify:${raw}`);
  } catch (_) {
    /* ignore */
  }

  return { ok: true, email };
}

module.exports = {
  VERIFY_TTL_MS,
  skipEmailVerify,
  isEmailVerified,
  createEmailVerifyToken,
  sendUserVerifyEmail,
  verifyEmailToken,
};
