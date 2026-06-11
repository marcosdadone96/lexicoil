'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { getJwtSecret, verifyAuthToken, syncKey } = require('./lib/authLib.js');
const { corsHeaders, getBearer, parseJsonBody, jsonResponse } = require('./lib/http.js');

const MAX_BODY = 900_000;

function sanitizeSync(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const flashcards = Array.isArray(src.flashcards) ? src.flashcards.slice(0, 500) : [];
  const history = Array.isArray(src.history) ? src.history.slice(0, 200) : [];
  const savedExams = Array.isArray(src.savedExams) ? src.savedExams.slice(0, 50) : [];
  const activityLog = Array.isArray(src.activityLog) ? src.activityLog.slice(0, 100) : [];
  const studyTime =
    src.studyTime && typeof src.studyTime === 'object'
      ? {
          streak: Math.max(0, Math.min(Number(src.studyTime.streak) || 0, 9999)),
          lastActiveDay: String(src.studyTime.lastActiveDay || '').slice(0, 10),
          monthKey: String(src.studyTime.monthKey || '').slice(0, 7),
          monthSec: Math.max(0, Math.min(Number(src.studyTime.monthSec) || 0, 9999999)),
          totalSec: Math.max(0, Math.min(Number(src.studyTime.totalSec) || 0, 99999999)),
          byDay:
            src.studyTime.byDay && typeof src.studyTime.byDay === 'object' ? src.studyTime.byDay : {},
        }
      : { streak: 0, lastActiveDay: '', monthKey: '', monthSec: 0, totalSec: 0, byDay: {} };
  const quota =
    src.quota && typeof src.quota === 'object'
      ? {
          month: String(src.quota.month || '').slice(0, 16),
          used: Math.max(0, Math.min(Number(src.quota.used) || 0, 999)),
        }
      : { month: '', used: 0 };
  return {
    flashcards,
    history,
    savedExams,
    activityLog,
    studyTime,
    quota,
    updatedAt: Date.now(),
  };
}

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, PUT, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (!getJwtSecret()) {
    return jsonResponse(503, cors, { error: 'auth_not_configured' });
  }

  const auth = verifyAuthToken(getBearer(event));
  if (!auth.ok) {
    return jsonResponse(401, cors, { error: auth.error || 'unauthorized' });
  }

  const store = getStoreForEvent(event);
  const key = syncKey(auth.email);

  if (event.httpMethod === 'GET') {
    try {
      const data = await store.get(key, { type: 'json' });
      return jsonResponse(200, cors, { data: data || sanitizeSync({}) });
    } catch (_) {
      return jsonResponse(200, cors, { data: sanitizeSync({}) });
    }
  }

  if (event.httpMethod === 'PUT') {
    let raw = event.body;
    if (event.isBase64Encoded && typeof raw === 'string') {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    }
    if (Buffer.byteLength(raw || '', 'utf8') > MAX_BODY) {
      return jsonResponse(413, cors, { error: 'payload_too_large' });
    }
    let body;
    try {
      body = parseJsonBody(event);
    } catch (_) {
      return jsonResponse(400, cors, { error: 'invalid_json' });
    }
    const data = sanitizeSync(body.data || body);
    await store.setJSON(key, data);
    return jsonResponse(200, cors, { ok: true, updatedAt: data.updatedAt });
  }

  return jsonResponse(405, cors, { error: 'method_not_allowed' });
};
