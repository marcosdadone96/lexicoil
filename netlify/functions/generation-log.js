'use strict';

const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth, emailToUserId, normalizeEmail } = require('./lib/authLib.js');
const { corsHeaders, jsonResponse, parseJsonBody } = require('./lib/http.js');
const sb = require('./lib/supabaseAdmin.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return jsonResponse(405, cors, { error: 'method_not_allowed' });

  const store = getStoreForEvent(event);
  const auth = await requireAuth(event, store);
  if (!auth.ok) {
    return jsonResponse(auth.status || 401, cors, { error: auth.error || 'unauthorized' });
  }

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  if (!sb.isConfigured()) return jsonResponse(200, cors, { ok: true, skipped: true });

  const email = normalizeEmail(auth.email);
  const userId = auth.userId || emailToUserId(email);

  try {
    const id = await sb.insertGeneration({
      user_id: userId,
      email,
      lang: body.lang || null,
      level: body.level || null,
      source: body.source || 'ai',
      topic: body.topic || null,
      vocab_words: Array.isArray(body.vocabWords) ? body.vocabWords : [],
      coverage: body.coverage != null ? Number(body.coverage) : null,
      valid: body.valid !== false,
      exam_data: body.examData || null,
    });
    return jsonResponse(200, cors, { ok: true, id });
  } catch (err) {
    console.error('[generation-log]', err.message);
    return jsonResponse(500, cors, { error: 'insert_failed' });
  }
};
