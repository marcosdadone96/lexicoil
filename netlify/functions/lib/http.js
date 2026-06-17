/**
 * Session auth helpers — HttpOnly `lc_token` cookie (primary) + Bearer header (transitional).
 * CORS: Access-Control-Allow-Credentials only for allowed origins (see allowedOrigins).
 */
'use strict';

const DEFAULT_ORIGINS = [
  'https://www.lexicoil.com',
  'https://lexicoil.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8888',
  'http://127.0.0.1:8888',
];

const AUTH_COOKIE_NAME = 'lc_token';
const AUTH_COOKIE_MAX_AGE = 2592000; // 30 days

function allowedOrigins() {
  const extra = (process.env.LEXICOIL_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

function isAllowedOrigin(origin) {
  const allowed = allowedOrigins();
  const isPreview =
    process.env.ALLOW_NETLIFY_PREVIEWS === 'true' && origin.includes('.netlify.app');
  return allowed.includes(origin) || isPreview;
}

function corsHeaders(event, methods = 'POST, OPTIONS') {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const isAllowed = isAllowedOrigin(origin);
  const headers = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': methods,
    Vary: 'Origin',
  };
  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function parseCookies(event) {
  const raw = (event?.headers?.cookie || event?.headers?.Cookie || '').trim();
  const out = {};
  if (!raw) return out;
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch (_) {
        out[key] = val;
      }
    }
  });
  return out;
}

function cookieUsesSecure(event) {
  const proto = event?.headers?.['x-forwarded-proto'] || event?.headers?.['X-Forwarded-Proto'] || '';
  if (proto === 'https') return true;
  const host = String(event?.headers?.host || event?.headers?.Host || '').toLowerCase();
  return !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}

function serializeAuthCookie(token, event) {
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${AUTH_COOKIE_MAX_AGE}`,
  ];
  if (cookieUsesSecure(event)) parts.push('Secure');
  return parts.join('; ');
}

function serializeClearAuthCookie(event) {
  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0',
  ];
  if (cookieUsesSecure(event)) parts.push('Secure');
  return parts.join('; ');
}

function getBearer(event) {
  const raw = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(raw));
  if (m) return m[1].trim();
  const cookies = parseCookies(event);
  return cookies[AUTH_COOKIE_NAME] || '';
}

/** Login/register responses: Set-Cookie + token in JSON body (body token is transitional). */
function parseJsonBody(event) {
  let raw = event.body;
  if (event.isBase64Encoded && typeof raw === 'string') {
    raw = Buffer.from(raw, 'base64').toString('utf8');
  }
  return JSON.parse(raw || '{}');
}

function jsonResponse(statusCode, headers, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...headers, ...extraHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function authSessionResponse(statusCode, cors, body, token, event) {
  return jsonResponse(statusCode, cors, { ...body, token }, {
    'Set-Cookie': serializeAuthCookie(token, event),
  });
}

function clearAuthSessionResponse(statusCode, cors, body, event) {
  return jsonResponse(statusCode, cors, body, {
    'Set-Cookie': serializeClearAuthCookie(event),
  });
}

module.exports = {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE,
  allowedOrigins,
  isAllowedOrigin,
  corsHeaders,
  parseCookies,
  getBearer,
  serializeAuthCookie,
  serializeClearAuthCookie,
  authSessionResponse,
  clearAuthSessionResponse,
  parseJsonBody,
  jsonResponse,
};
