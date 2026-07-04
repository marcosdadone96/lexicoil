'use strict';

/**
 * Mint a realtime Sprechen session (Pro). Scaffold — wire OpenAI Realtime / WebRTC next.
 *
 * POST { personaId, verbosity, subject, level, examId, fieldId }
 */
const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth } = require('./lib/authLib.js');
const { checkActionAccess } = require('./lib/actionAccessLib.js');
const { resolvePlan } = require('./lib/quotaLib.js');
const { corsHeaders, jsonResponse, parseJsonBody } = require('./lib/http.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  const store = getStoreForEvent(event);
  const auth = await requireAuth(event, store);
  if (!auth.ok) {
    return jsonResponse(auth.status || 401, cors, { error: auth.error || 'login_required' });
  }

  const plan = resolvePlan(auth.user);
  const access = checkActionAccess(plan, 'speaking_realtime');
  if (!access.ok) {
    return jsonResponse(access.error === 'pro_only' ? 403 : 401, cors, {
      error: access.error || 'forbidden',
      plan: access.plan,
    });
  }

  let body = {};
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  const personaId = String(body.personaId || 'balanced');
  const allowed = new Set(['quiet', 'balanced', 'talkative']);
  if (!allowed.has(personaId)) {
    return jsonResponse(400, cors, { error: 'invalid_persona' });
  }

  // TODO: checkAiCredits('speaking_realtime'), create provider session, return client token.
  return jsonResponse(501, cors, {
    error: 'not_implemented',
    message:
      'Realtime Sprechen session scaffold is ready. Next: OpenAI Realtime API or WebRTC proxy.',
    personaId,
    fieldId: body.fieldId || null,
    implementationStatus: 'scaffold',
  });
};
