'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { verifyAuthToken } = require('./lib/authLib.js');
const { getQuotaState } = require('./lib/quotaLib.js');
const { checkAiCredits, confirmAiCreditConsumption } = require('./lib/aiCredits.js');
const { corsHeaders, getBearer, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { synthesize } = require('./lib/ttsProvider.js');
const { resolveVoiceId } = require('./lib/ttsVoices.js');

const TEXT_MAX = 4000;
const AUDIO_MAX_BYTES = 2 * 1024 * 1024;

function normalizeText(text) {
  return String(text || '').trim().toLowerCase();
}

function textHash(text) {
  return crypto.createHash('sha256').update(normalizeText(text)).digest('hex').slice(0, 16);
}

function cacheKey(voice, text) {
  const v = String(voice || 'default').trim().slice(0, 32);
  return `tts:${v}:${textHash(text)}`;
}

function bundledAudioPath(voice, hash) {
  const name = `${String(voice || 'default').trim()}_${hash}.mp3`;
  const candidates = [
    path.join(__dirname, 'library', 'tts-cache', name),
    path.join(__dirname, '..', '..', 'library', 'tts-cache', name),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function readBundledAudio(voice, text, lang) {
  const hash = textHash(text);
  const candidates = [voice];
  const resolved = resolveVoiceId(voice, lang);
  if (resolved && resolved !== voice) candidates.push(resolved);
  for (const v of candidates) {
    const file = bundledAudioPath(v, hash);
    if (!file) continue;
    try {
      const buf = fs.readFileSync(file);
      if (buf.length && buf.length <= AUDIO_MAX_BYTES) return buf;
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

async function loadCachedAudio(store, voice, text, lang) {
  const key = cacheKey(voice, text);
  try {
    const entry = await store.get(key, { type: 'json' });
    if (entry?.audioBase64) {
      const buf = Buffer.from(entry.audioBase64, 'base64');
      if (buf.length && buf.length <= AUDIO_MAX_BYTES) return buf;
    }
  } catch (_) {
    /* miss */
  }
  return readBundledAudio(voice, text, lang);
}

function audioResponse(cors, buf) {
  return jsonResponse(
    200,
    { ...cors, 'Cache-Control': 'public, max-age=604800' },
    { found: true, audioBase64: buf.toString('base64'), contentType: 'audio/mpeg' },
  );
}

function validVoice(voice) {
  return /^[a-zA-Z0-9._-]{1,32}$/.test(String(voice || 'default'));
}

function validLang(lang) {
  return !lang || /^[a-z]{2}(-[A-Z]{2})?$/.test(String(lang));
}

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  const store = getStoreForEvent(event);

  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const text = String(params.text || '');
    const voice = String(params.voice || 'default').trim();
    const lang = String(params.lang || '').trim();

    if (!text.trim() || text.trim().length > TEXT_MAX) {
      return jsonResponse(400, cors, { error: 'invalid_text' });
    }
    if (!validVoice(voice) || !validLang(lang)) {
      return jsonResponse(400, cors, { error: 'invalid_params' });
    }

    const buf = await loadCachedAudio(store, voice, text, lang);
    if (buf) return audioResponse(cors, buf);
    return jsonResponse(200, cors, { found: false });
  }

  if (event.httpMethod === 'POST') {
    const auth = verifyAuthToken(getBearer(event));
    if (!auth.ok) return jsonResponse(401, cors, { error: 'login_required' });

    const qState = await getQuotaState(event);
    if (!qState.ok) {
      if (qState.error === 'token_revoked') {
        return jsonResponse(401, cors, { error: 'token_revoked' });
      }
      return jsonResponse(403, cors, { error: 'pro_required' });
    }
    if (qState.plan !== 'pro') {
      return jsonResponse(403, cors, { error: 'pro_required' });
    }

    let body;
    try {
      body = parseJsonBody(event);
    } catch (_) {
      return jsonResponse(400, cors, { error: 'invalid_json' });
    }

    const text = String(body.text || '');
    const voice = String(body.voice || 'default').trim();
    const lang = String(body.lang || '').trim();

    if (!text.trim() || text.trim().length > TEXT_MAX) {
      return jsonResponse(400, cors, { error: 'invalid_text' });
    }
    if (!validVoice(voice) || !validLang(lang)) {
      return jsonResponse(400, cors, { error: 'invalid_params' });
    }

    const existing = await loadCachedAudio(store, voice, text, lang);
    // Cached audio is free — no AI credits charged for a cache hit
    if (existing) return audioResponse(cors, existing);

    // B-6 fix: TTS synthesis consumes 1 AI credit per uncached request
    const creditCheck = await checkAiCredits(event, 'tts');
    if (!creditCheck.ok) {
      const status = creditCheck.error === 'ai_credits_exhausted' ? 402 : 403;
      return jsonResponse(status, cors, {
        error: creditCheck.error,
        remaining: creditCheck.remaining,
        aiUsed: creditCheck.used,
        aiMax: creditCheck.max,
        autoRechargeFailed: creditCheck.autoRechargeFailed || false,
        reason: creditCheck.reason || undefined,
      });
    }

    const audio = await synthesize(text.trim(), voice, lang);
    if (!audio || !audio.length || audio.length > AUDIO_MAX_BYTES) {
      return jsonResponse(200, cors, { unavailable: true });
    }

    // Credit confirmed only after a successful synthesis
    await confirmAiCreditConsumption(event, 'tts').catch((err) => {
      console.warn('[tts] ai credit confirm failed:', err.message);
    });

    const key = cacheKey(voice, text);
    await store.setJSON(key, {
      audioBase64: audio.toString('base64'),
      contentType: 'audio/mpeg',
      voice,
      lang,
      textHash: textHash(text),
      createdAt: Date.now(),
      source: 'cloud',
    });

    return audioResponse(cors, audio);
  }

  return jsonResponse(405, cors, { error: 'method_not_allowed' });
};
