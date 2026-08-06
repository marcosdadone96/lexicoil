'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { startOfficialTimer, finishOfficialTimer } = require('./lib/examOfficialTimer.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  const store = getStoreForEvent(event);
  if (!store) return jsonResponse(503, cors, { error: 'storage_unavailable' });

  const auth = await requireAuth(event, store);
  if (!auth.ok) return jsonResponse(auth.status || 401, cors, { error: auth.error || 'unauthorized' });

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  const action = String(body.action || '').toLowerCase();

  if (action === 'start') {
    const examSavedId = body.examSavedId || body.examId;
    if (!examSavedId) return jsonResponse(400, cors, { error: 'exam_saved_id_required' });
    const result = await startOfficialTimer(store, {
      userId: auth.userId,
      email: auth.email,
      examSavedId,
      limitMinutes: body.limitMinutes,
      goalId: body.goalId,
    });
    if (!result.ok) return jsonResponse(400, cors, result);
    return jsonResponse(200, cors, result);
  }

  if (action === 'finish') {
    const examSavedId = body.examSavedId || body.examId;
    const timerSessionId = body.timerSessionId;
    if (!examSavedId || !timerSessionId) {
      return jsonResponse(400, cors, { error: 'exam_saved_id_and_timer_session_required' });
    }
    const result = await finishOfficialTimer(store, {
      userId: auth.userId,
      timerSessionId,
      examSavedId,
    });
    if (!result.ok) return jsonResponse(400, cors, result);
    return jsonResponse(200, cors, result);
  }

  return jsonResponse(400, cors, { error: 'invalid_action', allowed: ['start', 'finish'] });
};
