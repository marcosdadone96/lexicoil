'use strict';

const { randomBytes } = require('crypto');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { normalizeEmail, userKey } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { getSiteUrl } = require('./lib/siteConfig.js');
const { sendPasswordResetEmail } = require('./lib/email.js');

const GENERIC_MSG = 'If that email exists, a reset link was sent.';

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

  if (user) {
    const token = randomBytes(24).toString('hex');
    const exp = Date.now() + 60 * 60 * 1000;
    await store.setJSON(`reset:${token}`, { email, exp }, { metadata: { ttl: 3600 } });
    const resetUrl = `${getSiteUrl()}/?reset=${token}`;
    try {
      await sendPasswordResetEmail(email, resetUrl);
    } catch (err) {
      console.error('[auth-forgot] email failed:', err.message);
    }
  }

  return jsonResponse(200, cors, { ok: true, message: GENERIC_MSG });
};
