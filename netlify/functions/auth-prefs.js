'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth } = require('./lib/authLib.js');
const { corsHeaders, jsonResponse, parseJsonBody } = require('./lib/http.js');
const { setAutoRechargeEnabled, getAiCredits } = require('./lib/aiCredits.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  const store = getStoreForEvent(event);
  const auth = await requireAuth(event, store);
  if (!auth.ok) {
    return jsonResponse(auth.status || 401, cors, { error: auth.error || 'unauthorized' });
  }

  if (event.httpMethod === 'GET') {
    const credits = await getAiCredits(event);
    return jsonResponse(200, cors, {
      ok: true,
      autoRecharge: credits.autoRecharge || { enabled: false, pack: 50, maxPerMonth: 2, usedThisMonth: 0 },
      aiCredits: credits,
    });
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  if (typeof body.autoRechargeEnabled !== 'boolean') {
    return jsonResponse(400, cors, { error: 'invalid_fields' });
  }

  const result = await setAutoRechargeEnabled(store, auth.email, body.autoRechargeEnabled);
  return jsonResponse(200, cors, { ok: true, autoRecharge: result.autoRecharge });
};
