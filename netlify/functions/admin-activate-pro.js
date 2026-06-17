'use strict';

const crypto = require('crypto');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { normalizeEmail } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { resolvePlan, maxForPlan } = require('./lib/quotaLib.js');
const { activateProForEmail } = require('./lib/proUpgrade.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  const adminSecret = String(process.env.ADMIN_SECRET || '').trim();
  if (!adminSecret) {
    return jsonResponse(503, cors, { error: 'admin_not_configured' });
  }

  const authHeader =
    (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  // C-4 fix: use timingSafeEqual to prevent timing-based secret extraction
  const tokenOk =
    token.length > 0 &&
    token.length === adminSecret.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminSecret));
  if (!tokenOk) {
    return jsonResponse(401, cors, { error: 'unauthorized' });
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
  const result = await activateProForEmail(store, email, { sendEmail: true });
  if (!result.ok) {
    return jsonResponse(404, cors, { error: result.error || 'upgrade_failed' });
  }

  const plan = resolvePlan(result.user);
  return jsonResponse(200, cors, {
    ok: true,
    email,
    plan,
    quota: { used: 0, max: maxForPlan(plan) },
  });
};
