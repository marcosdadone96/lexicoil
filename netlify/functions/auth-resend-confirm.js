'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { normalizeEmail, userKey } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const {
  isEmailVerified,
  createEmailVerifyToken,
  sendUserVerifyEmail,
} = require('./lib/emailVerify.js');

const GENERIC_MSG = 'If that email is pending confirmation, a new link was sent.';

exports.handler = async (event) => {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return jsonResponse(400, cors, { error: 'invalid_email' });
  }

  const store = getStoreForEvent(event);
  let user = null;
  try {
    user = await store.get(userKey(email), { type: 'json' });
  } catch (_) {
    user = null;
  }

  if (user && !isEmailVerified(user)) {
    try {
      const token = await createEmailVerifyToken(store, email);
      await sendUserVerifyEmail(email, user.name || email, token);
    } catch (err) {
      console.error('[auth-resend-confirm] email failed:', err.message);
    }
  }

  return jsonResponse(200, cors, { ok: true, message: GENERIC_MSG });
};
