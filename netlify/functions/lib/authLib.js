'use strict';

const crypto = require('crypto');
const { verifyJwt } = require('./jwt.js');

function getJwtSecret() {
  const secret = process.env.AUTH_JWT_SECRET || process.env.LEXICOIL_JWT_SECRET;
  if (!secret || String(secret).length < 16) return null;
  return String(secret);
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function userKey(email) {
  return `user:${normalizeEmail(email)}`;
}

function syncKey(email) {
  return `sync:${normalizeEmail(email)}`;
}

/**
 * Derive a stable UUID v5-like identifier from an email address.
 * Used when the user was created via our custom JWT auth (not Supabase OAuth).
 * The same email always produces the same UUID, enabling Supabase lookups.
 */
function emailToUserId(email) {
  const hash = crypto.createHash('sha256').update('lc:user:' + normalizeEmail(email)).digest('hex');
  return [hash.slice(0, 8), hash.slice(8, 12), '5' + hash.slice(13, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-');
}

function verifyAuthToken(token) {
  const secret = getJwtSecret();
  if (!secret) return { ok: false, error: 'misconfigured' };
  const payload = verifyJwt(token, secret);
  if (!payload || payload.typ !== 'lc-auth' || typeof payload.sub !== 'string') {
    return { ok: false, error: 'unauthorized' };
  }
  const email = normalizeEmail(payload.sub);
  if (!email) return { ok: false, error: 'unauthorized' };
  // uid: Supabase UUID if present in token, otherwise derived from email
  const userId = payload.uid || emailToUserId(email);
  return { ok: true, email, userId, payload, tokenVersion: payload.tv || 1 };
}

function getTokenVersion(user) {
  return user?.tokenVersion || 1;
}

function signAuthToken(email, name, tokenVersion = 1) {
  const secret = getJwtSecret();
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 30;
  const { signJwt } = require('./jwt.js');
  return {
    token: signJwt(
      {
        sub: normalizeEmail(email),
        name: String(name || '').slice(0, 80),
        typ: 'lc-auth',
        tv: tokenVersion || 1,
        iat: now,
        exp,
      },
      secret,
    ),
    expiresAt: exp * 1000,
  };
}

module.exports = {
  getJwtSecret,
  normalizeEmail,
  userKey,
  syncKey,
  emailToUserId,
  verifyAuthToken,
  signAuthToken,
  getTokenVersion,
};
