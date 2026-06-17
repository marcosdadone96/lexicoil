'use strict';

const fs = require('fs');
const path = require('path');

function stripQuotes(value) {
  let k = String(value || '').trim();
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

function parseEnvFile(content) {
  const out = {};
  for (const line of String(content || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = stripQuotes(t.slice(i + 1));
  }
  return out;
}

function readDotEnvAnthropicKey() {
  const roots = new Set([
    process.cwd(),
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '../../..'),
  ]);
  for (const root of roots) {
    const file = path.join(root, '.env');
    try {
      if (!fs.existsSync(file)) continue;
      const key = parseEnvFile(fs.readFileSync(file, 'utf8')).ANTHROPIC_API_KEY;
      if (key && key.startsWith('sk-ant-')) return key;
    } catch (_) {
      /* ignore unreadable .env */
    }
  }
  return null;
}

/**
 * Resolve Anthropic API key for direct api.anthropic.com calls.
 * Netlify Dev AI Gateway overwrites ANTHROPIC_API_KEY with a JWT — fall back to .env.
 */
function readAnthropicKey() {
  const explicit = stripQuotes(process.env.ANTHROPIC_API_KEY_DIRECT);
  if (explicit.startsWith('sk-ant-')) return explicit;

  const fromEnv = stripQuotes(process.env.ANTHROPIC_API_KEY);
  if (fromEnv.startsWith('sk-ant-')) return fromEnv;

  const fromFile = readDotEnvAnthropicKey();
  if (fromFile) {
    if (fromEnv && fromEnv !== fromFile) {
      console.warn(
        '[anthropicKey] Using .env sk-ant key — process ANTHROPIC_API_KEY was replaced (likely Netlify AI Gateway JWT)',
      );
    }
    return fromFile;
  }

  return fromEnv;
}

function anthropicKeyLooksValid(key) {
  return typeof key === 'string' && key.startsWith('sk-ant-') && key.length >= 40;
}

function anthropicKeyFingerprint(key) {
  if (!key) return '(empty)';
  if (key.length <= 16) return `len=${key.length}`;
  return `${key.slice(0, 8)}…${key.slice(-4)} (len=${key.length})`;
}

function anthropicKeyMisconfigMessage(key) {
  if (!key) return 'AI service is not configured on the server';
  if (key.startsWith('eyJ')) {
    return 'ANTHROPIC_API_KEY is a Netlify AI Gateway JWT — set sk-ant-... in .env or ANTHROPIC_API_KEY_DIRECT';
  }
  if (!key.startsWith('sk-ant-')) {
    return 'ANTHROPIC_API_KEY must start with sk-ant- (Anthropic API key)';
  }
  return 'ANTHROPIC_API_KEY appears invalid';
}

function rejectBadAnthropicKey(apiKey, jsonResponse, cors) {
  if (anthropicKeyLooksValid(apiKey)) return null;
  const msg = anthropicKeyMisconfigMessage(apiKey);
  console.error('[claude-chat] bad ANTHROPIC_API_KEY:', anthropicKeyFingerprint(apiKey), msg);
  return jsonResponse(503, cors, { error: msg, code: 'anthropic_key_misconfigured' });
}

module.exports = {
  readAnthropicKey,
  anthropicKeyLooksValid,
  anthropicKeyFingerprint,
  anthropicKeyMisconfigMessage,
  rejectBadAnthropicKey,
};
