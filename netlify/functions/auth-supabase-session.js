'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { getJwtSecret, normalizeEmail, userKey, signAuthToken, getTokenVersion } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, authSessionResponse, jsonResponse } = require('./lib/http.js');
const { completeSupabaseSession } = require('./lib/completeSupabaseSession.js');
const { readSupabaseEnv, supabasePasswordGrant } = require('./lib/supabaseAuthRest.js');

exports.handler = async function handler(event) {
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

  const accessToken = String(body.access_token || '').trim();
  if (!accessToken) {
    return jsonResponse(400, cors, { error: 'missing_token' });
  }

  try {
    return await completeSupabaseSession(event, cors, accessToken, body);
  } catch (err) {
    console.error('auth-supabase-session:', err);
    return jsonResponse(500, cors, { error: 'internal_error' });
  }
};
