'use strict';

/**
 * Gemini Live ephemeral token mint (server-only).
 * API key never leaves the server; client uses short-lived token.name.
 *
 * REST: POST /v1alpha/auth_tokens (Gemini Developer API).
 * Docs: https://ai.google.dev/gemini-api/docs/ephemeral-tokens
 */

const fs = require('fs');
const path = require('path');
const { LIVE_MODEL } = require('./speakingLiveExam.js');
const { wrapFetchError } = require('./tlsFetchHint.js');

function stripQuotes(value) {
  let k = String(value || '').trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

function looksLikeGeminiApiKey(key) {
  const k = String(key || '').trim();
  if (k.length < 20) return false;
  if (/^No value/i.test(k) || /environment variable/i.test(k)) return false;
  if (/^(your|xxx|placeholder|changeme)/i.test(k)) return false;
  return true;
}

function readDotEnvGeminiKey() {
  const roots = [process.cwd(), path.resolve(__dirname, '../..'), path.resolve(__dirname, '../../..')];
  for (const root of roots) {
    const file = path.join(root, '.env');
    try {
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#') || !t.startsWith('GEMINI_API_KEY=')) continue;
        const v = stripQuotes(t.slice('GEMINI_API_KEY='.length));
        if (looksLikeGeminiApiKey(v)) return v;
      }
    } catch (_) {
      /* ignore */
    }
  }
  return '';
}

function readGeminiKey() {
  const direct = stripQuotes(process.env.GEMINI_API_KEY_DIRECT);
  if (looksLikeGeminiApiKey(direct)) return direct;

  const fromFile = readDotEnvGeminiKey();
  const fromEnv = stripQuotes(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  // netlify dev injects linked-site env vars and can override a working .env
  // with stale/placeholder dashboard values — prefer local .env when valid.
  if (looksLikeGeminiApiKey(fromFile)) {
    if (fromEnv && fromEnv !== fromFile) {
      console.warn(
        '[geminiLiveAuth] Using .env GEMINI_API_KEY — process.env value differs (likely Netlify Dev site env override)',
      );
    }
    return fromFile;
  }

  if (looksLikeGeminiApiKey(fromEnv)) return fromEnv;
  return fromFile || fromEnv || '';
}

/**
 * Mint ephemeral token locked to Live exam config (PTT + NO_INTERRUPTION + systemInstruction).
 * @param {{ liveConfig: object, model?: string, expireMinutes?: number, newSessionExpireSeconds?: number }} opts
 */
async function mintEphemeralLiveToken(opts) {
  const apiKey = readGeminiKey();
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY missing');
    err.code = 'gemini_key_missing';
    throw err;
  }

  const model = opts.model || LIVE_MODEL;
  const expireMinutes = Number.isFinite(opts.expireMinutes) ? opts.expireMinutes : 30;
  const newSessionSecs = Number.isFinite(opts.newSessionExpireSeconds) ? opts.newSessionExpireSeconds : 120;
  const now = Date.now();
  const expireTime = new Date(now + expireMinutes * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(now + newSessionSecs * 1000).toISOString();

  const liveConfig = opts.liveConfig || {};
  // REST AuthToken.bidiGenerateContentSetup is BidiGenerateContentSetup fields
  // (model, generationConfig, …) — NOT wrapped in an extra `setup` key.
  const body = {
    uses: 1,
    expireTime,
    newSessionExpireTime,
    bidiGenerateContentSetup: {
      model: model.startsWith('models/') ? model : `models/${model}`,
      generationConfig: {
        responseModalities: liveConfig.responseModalities || ['AUDIO'],
        ...(liveConfig.speechConfig ? { speechConfig: liveConfig.speechConfig } : {}),
      },
      systemInstruction: liveConfig.systemInstruction,
      realtimeInputConfig: liveConfig.realtimeInputConfig || {
        automaticActivityDetection: { disabled: true },
        activityHandling: 'NO_INTERRUPTION',
      },
      inputAudioTranscription: liveConfig.inputAudioTranscription || {},
      outputAudioTranscription: liveConfig.outputAudioTranscription || {},
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${encodeURIComponent(apiKey)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    throw wrapFetchError(fetchErr);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `auth_tokens failed (${res.status})`;
    const err = new Error(msg);
    err.code = 'ephemeral_mint_failed';
    err.status = res.status;
    err.details = data?.error || data;
    throw err;
  }

  const tokenName = data.name || data.authToken?.name;
  if (!tokenName) {
    const err = new Error('ephemeral token missing name');
    err.code = 'ephemeral_mint_invalid';
    err.details = data;
    throw err;
  }

  return {
    token: tokenName,
    expireTime: data.expireTime || expireTime,
    newSessionExpireTime: data.newSessionExpireTime || newSessionExpireTime,
    model,
    apiVersion: 'v1alpha',
    /** Client must use constrained WS endpoint when token locks setup. */
    websocketUrl:
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained',
  };
}

module.exports = {
  readGeminiKey,
  mintEphemeralLiveToken,
};
