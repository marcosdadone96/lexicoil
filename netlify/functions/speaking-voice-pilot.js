'use strict';

/**
 * GET — whether signed-in Pro user is in the Sprechen voice pilot.
 */
const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth } = require('./lib/authLib.js');
const { resolvePlan } = require('./lib/quotaLib.js');
const { corsHeaders, jsonResponse } = require('./lib/http.js');
const {
  isSpeakingVoicePilotEligible,
  pilotConfigSummary,
} = require('./lib/speakingVoicePilot.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'GET') return jsonResponse(405, cors, { error: 'method_not_allowed' });

  const store = getStoreForEvent(event);
  if (!store) return jsonResponse(503, cors, { error: 'store_unavailable' });

  const auth = await requireAuth(event, store);
  if (!auth.ok) {
    return jsonResponse(auth.status || 401, cors, { error: auth.error || 'login_required' });
  }

  const plan = resolvePlan(auth.user);
  const eligible = isSpeakingVoicePilotEligible(auth.email, plan);
  const cfg = pilotConfigSummary();

  return jsonResponse(200, cors, {
    ok: true,
    eligible,
    plan,
    pilotEnabled: cfg.enabled,
  });
};
