'use strict';

const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { getStoreForEvent } = require('./lib/blobStore.js');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LANGS = new Set(['de', 'en', 'es']);
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

exports.handler = async (event) => {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, headers, { error: 'method_not_allowed' });
  }

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, headers, { error: 'invalid_json' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const lang = String(body.lang || '').trim();
  const level = String(body.level || '').trim();

  if (!EMAIL_RE.test(email)) {
    return jsonResponse(400, headers, { error: 'invalid_email' });
  }
  if (!LANGS.has(lang) || !LEVELS.has(level)) {
    return jsonResponse(400, headers, { error: 'invalid_combo' });
  }

  const key = `level_waitlist:${lang}_${level}`;
  const store = getStoreForEvent(event);
  let list = [];
  try {
    const raw = await store.get(key, { type: 'json' });
    if (Array.isArray(raw)) list = raw;
  } catch (_) {
    /* first entry */
  }
  if (!list.includes(email)) list.push(email);
  await store.setJSON(key, list);

  return jsonResponse(200, headers, { ok: true });
};
