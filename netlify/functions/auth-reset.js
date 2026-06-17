'use strict';

const bcrypt = require('bcryptjs');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { normalizeEmail, userKey } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');

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

  const token = String(body.token || '').trim();
  const password = String(body.password || '');
  if (!token || password.length < 6) {
    return jsonResponse(400, cors, { error: 'invalid_fields' });
  }

  const store = getStoreForEvent(event);
  let reset = null;
  try {
    reset = await store.get(`reset:${token}`, { type: 'json' });
  } catch (_) {
    reset = null;
  }

  if (!reset || !reset.email || (reset.exp && Date.now() > reset.exp)) {
    return jsonResponse(400, cors, { error: 'invalid_or_expired_token' });
  }

  const email = normalizeEmail(reset.email);
  const key = userKey(email);
  let user = null;
  try {
    user = await store.get(key, { type: 'json' });
  } catch (_) {
    user = null;
  }

  if (!user) {
    return jsonResponse(404, cors, { error: 'user_not_found' });
  }

  const updated = {
    ...user,
    passwordHash: bcrypt.hashSync(password, 10),
    tokenVersion: (user.tokenVersion || 1) + 1,
  };
  await store.setJSON(key, updated);

  try {
    await store.delete(`reset:${token}`);
  } catch (_) {
    /* ignore */
  }

  return jsonResponse(200, cors, { ok: true, message: 'Password updated. You can sign in now.' });
};
