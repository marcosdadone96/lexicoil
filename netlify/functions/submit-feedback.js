'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { verifyAuthToken, normalizeEmail } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, jsonResponse, getBearer } = require('./lib/http.js');
const {
  validateFeedbackPayload,
  ipHash,
  clientIp,
  checkFeedbackRateLimit,
} = require('./lib/feedbackLib.js');
const sb = require('./lib/supabaseAdmin.js');

function optionalSession(event) {
  const token = getBearer(event);
  if (!token) return { userId: null, email: null };
  const auth = verifyAuthToken(token);
  if (!auth.ok) return { userId: null, email: null };
  return { userId: auth.userId, email: normalizeEmail(auth.email) };
}

function userAgent(event) {
  return String(
    event.headers['user-agent'] || event.headers['User-Agent'] || '',
  ).slice(0, 512);
}

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return jsonResponse(405, cors, { error: 'method_not_allowed' });

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  const validated = validateFeedbackPayload(body);
  if (!validated.ok) {
    return jsonResponse(400, cors, { error: validated.error });
  }

  const session = optionalSession(event);
  const store = getStoreForEvent(event);
  const salt =
    process.env.GUEST_IP_SALT ||
    process.env.AUTH_JWT_SECRET ||
    process.env.LEXICOIL_JWT_SECRET ||
    'lexicoil-feedback';

  const allowed = await checkFeedbackRateLimit(store, {
    ipKey: `ip:${ipHash(clientIp(event), salt)}`,
    userKey: session.userId ? `user:${session.userId}` : null,
  });
  if (!allowed) {
    return jsonResponse(429, cors, { error: 'rate_limited' });
  }

  if (!sb.isConfigured()) {
    console.error('[submit-feedback] Supabase not configured');
    return jsonResponse(503, cors, { error: 'feedback_unavailable' });
  }

  const email = validated.email || session.email || null;

  const id = await sb.insertFeedback({
    user_id: session.userId,
    email,
    message: validated.message,
    page: validated.page,
    user_agent: userAgent(event),
  });

  if (!id) {
    return jsonResponse(500, cors, { error: 'insert_failed' });
  }

  return jsonResponse(200, cors, { ok: true, id });
};
