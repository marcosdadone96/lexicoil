'use strict';

const bcrypt = require('bcryptjs');
const { getStoreForEvent } = require('./lib/blobStore.js');
const {
  getJwtSecret,
  normalizeEmail,
  userKey,
  signAuthToken,
  getTokenVersion,
} = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, authSessionResponse, jsonResponse } = require('./lib/http.js');
const { parseFreeComboFromBody, ensureUserFreeCombo, freeComboForResponse } = require('./lib/freeComboLib.js');
const { checkIpRateLimit, recordIpRateLimitHit } = require('./lib/ipRateLimit.js');
const {
  skipEmailVerify,
  createEmailVerifyToken,
  sendUserVerifyEmail,
} = require('./lib/emailVerify.js');

const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 24 * 60 * 60 * 1000;

exports.handler = async (event) => {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }
  if (!getJwtSecret()) {
    return jsonResponse(503, cors, { error: 'auth_not_configured' });
  }

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  const name = String(body.name || '').trim().slice(0, 80);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!name || !email || password.length < 6) {
    return jsonResponse(400, cors, { error: 'invalid_fields' });
  }

  const store = getStoreForEvent(event);
  const rl = await checkIpRateLimit(store, event, 'ratelimit_register', {
    limit: REGISTER_LIMIT,
    windowMs: REGISTER_WINDOW_MS,
  });
  if (!rl.ok) {
    return jsonResponse(429, cors, { error: 'too_many_registrations' });
  }

  const key = userKey(email);

  const requireVerify = !skipEmailVerify();
  const user = ensureUserFreeCombo({
    name,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    plan: 'free',
    pro: false,
    createdAt: Date.now(),
    freeCombo: parseFreeComboFromBody(body),
    emailVerified: requireVerify ? false : true,
    emailVerifiedAt: requireVerify ? null : Date.now(),
  });

  // B-3 fix: atomic write with onlyIfNew — prevents race-condition account overwrite
  const writeResult = await store.setJSON(key, user, { onlyIfNew: true });
  if (writeResult && writeResult.modified === false) {
    return jsonResponse(409, cors, { error: 'email_taken' });
  }

  await recordIpRateLimitHit(store, { ...rl, windowMs: REGISTER_WINDOW_MS });

  if (requireVerify) {
    try {
      const token = await createEmailVerifyToken(store, email);
      await sendUserVerifyEmail(email, name, token);
    } catch (err) {
      console.error('[auth-register] verify email failed:', err.message);
    }
    return jsonResponse(200, cors, {
      pendingConfirmation: true,
      email,
      message: 'Check your email to confirm your account before signing in.',
    });
  }

  const session = signAuthToken(email, name, getTokenVersion(user));
  return authSessionResponse(200, cors, {
    expiresAt: session.expiresAt,
    user: {
      name,
      email,
      plan: 'free',
      pro: false,
      freeCombo: freeComboForResponse(user),
    },
  }, session.token, event);
};
