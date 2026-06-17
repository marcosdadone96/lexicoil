'use strict';

/**
 * Generation Tickets — server-signed tokens that authorize a fixed number of
 * Anthropic AI calls for one exam generation session.
 *
 * Format: base64url(JSON_payload) . HMAC-SHA256(base64url(JSON_payload), secret)
 *
 * The ticket is issued ONCE by startGeneration (after charging quota) and then
 * passed by the client for every chunk call.  The server tracks usage via a
 * Blob counter keyed on the ticket nonce so concurrent requests can't exceed
 * maxChunks even under race conditions.
 */

const crypto = require('crypto');

const TICKET_TTL_SEC = 90;      // ticket valid for 90 seconds
const MAX_CHUNKS_ALLOWED = 20;  // hard upper bound the server will ever grant

// Scopes that are issued via startGeneration and require a ticket on chunk calls
const TICKETED_SCOPES = new Set([
  'exam_generation',
  'personal_exam',
  'quick_exam',
]);

function signGenTicket(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyGenTicket(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch (_) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }

  if (typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

/**
 * Create and sign a generation ticket.
 * @param {string} sub   - authenticated email or 'guest:{ipHash}'
 * @param {string} scope - one of TICKETED_SCOPES
 * @param {number} maxChunks - how many AI calls this ticket authorises
 * @param {string} secret - server HMAC secret
 * @returns {{ token: string, payload: object }}
 */
function createGenTicket(sub, scope, maxChunks, secret) {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = {
    sub,
    scope,
    maxChunks: Math.max(1, Math.min(Number(maxChunks) || 1, MAX_CHUNKS_ALLOWED)),
    nonce,
    iat: now,
    exp: now + TICKET_TTL_SEC,
  };
  return { token: signGenTicket(payload, secret), payload };
}

module.exports = {
  signGenTicket,
  verifyGenTicket,
  createGenTicket,
  TICKET_TTL_SEC,
  MAX_CHUNKS_ALLOWED,
  TICKETED_SCOPES,
};
