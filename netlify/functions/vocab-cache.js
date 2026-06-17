'use strict';

const crypto = require('crypto');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { freeTranslate } = require('./lib/freeTranslate.js');

const PASSAGE_MAX = 4000;
const PUT_LIMIT = 40;
const PUT_WINDOW_MS = 60 * 60 * 1000;

function normalizeText(text) {
  return String(text || '').trim().toLowerCase();
}

function textHash(text) {
  return crypto.createHash('sha256').update(normalizeText(text)).digest('hex').slice(0, 16);
}

function cacheKey(from, to, text) {
  return `xlat:${from}:${to}:${textHash(text)}`;
}

function clientIp(event) {
  const raw =
    event.headers['x-forwarded-for'] ||
    event.headers['X-Forwarded-For'] ||
    event.headers['client-ip'] ||
    '';
  return String(raw).split(',')[0].trim() || 'unknown';
}

function ipHash(ip) {
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 16);
}

async function checkPutRateLimit(store, event) {
  const key = `ratelimit_vocab_put:${ipHash(clientIp(event))}`;
  let entry = null;
  try {
    entry = await store.get(key, { type: 'json' });
  } catch (_) {
    entry = null;
  }
  const now = Date.now();
  if (!entry || now - entry.since > PUT_WINDOW_MS) {
    await store.setJSON(key, { count: 1, since: now });
    return true;
  }
  if (entry.count >= PUT_LIMIT) return false;
  entry.count += 1;
  await store.setJSON(key, entry);
  return true;
}

function validLang(lang) {
  return /^[a-z]{2}$/.test(String(lang || ''));
}

function validateEntry(from, to, text, translation) {
  if (!validLang(from) || !validLang(to) || from === to) return 'invalid_lang';
  const t = String(text || '').trim();
  const tr = String(translation || '').trim();
  if (!t || !tr) return 'empty';
  if (t.length > PASSAGE_MAX || tr.length > PASSAGE_MAX) return 'too_long';
  return null;
}

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, PUT, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  const store = getStoreForEvent(event);

  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const from = String(params.from || '').trim().toLowerCase();
    const to = String(params.to || '').trim().toLowerCase();
    const text = String(params.text || '');

    if (!validLang(from) || !validLang(to) || !text.trim()) {
      return jsonResponse(400, cors, { error: 'invalid_params' });
    }
    if (text.trim().length > PASSAGE_MAX) {
      return jsonResponse(400, cors, { error: 'too_long' });
    }

    const key = cacheKey(from, to, text);
    let entry = null;
    try {
      entry = await store.get(key, { type: 'json' });
    } catch (_) {
      entry = null;
    }

    if (entry?.translation) {
      return jsonResponse(
        200,
        { ...cors, 'Cache-Control': 'public, max-age=86400' },
        { found: true, translation: entry.translation, source: entry.source || 'cache' },
      );
    }

    const translated = await freeTranslate(text.trim(), from, to);
    if (translated) {
      const payload = {
        translation: translated,
        source: 'dict',
        from,
        to,
        textHash: textHash(text),
        createdAt: Date.now(),
      };
      try {
        await store.setJSON(key, payload);
      } catch (_) {
        /* cache write failure — still return translation */
      }
      return jsonResponse(
        200,
        { ...cors, 'Cache-Control': 'public, max-age=86400' },
        { found: true, translation: translated, source: 'dict' },
      );
    }

    return jsonResponse(200, cors, { found: false });
  }

  if (event.httpMethod === 'PUT') {
    const allowed = await checkPutRateLimit(store, event);
    if (!allowed) return jsonResponse(429, cors, { error: 'rate_limited' });

    let body;
    try {
      body = parseJsonBody(event);
    } catch (_) {
      return jsonResponse(400, cors, { error: 'invalid_json' });
    }

    const from = String(body.from || '').trim().toLowerCase();
    const to = String(body.to || '').trim().toLowerCase();
    const text = String(body.text || '');
    const translation = String(body.translation || '');
    const source = String(body.source || 'manual').slice(0, 24);

    const err = validateEntry(from, to, text, translation);
    if (err) return jsonResponse(400, cors, { error: err });

    const key = cacheKey(from, to, text);
    await store.setJSON(key, {
      translation: translation.trim(),
      source,
      from,
      to,
      textHash: textHash(text),
      createdAt: Date.now(),
    });
    return jsonResponse(200, cors, { saved: true });
  }

  return jsonResponse(405, cors, { error: 'method_not_allowed' });
};
