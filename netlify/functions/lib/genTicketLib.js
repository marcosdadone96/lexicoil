'use strict';

const { verifyGenTicket, TICKETED_SCOPES } = require('./genTicket.js');
const { getJwtSecret } = require('./authLib.js');
const { getStoreForEvent } = require('./blobStore.js');
const { casWriteJson } = require('./casBlob.js');

/**
 * Verify ticket and atomically consume one session slot (hybrid factory path).
 * Credits are charged once at startGeneration — this only authorizes execution.
 */
async function consumeGenTicketSession(event, genTicket) {
  const secret = getJwtSecret();
  if (!secret) return { error: 'misconfigured', status: 503 };
  const ticketPayload = verifyGenTicket(genTicket, secret);
  if (!ticketPayload) return { error: 'ticket_invalid', status: 403 };
  if (!TICKETED_SCOPES.has(ticketPayload.scope)) {
    return { error: 'ticket_scope_invalid', status: 403 };
  }

  const store = getStoreForEvent(event);
  if (!store) {
    console.warn('[genTicketLib] store unavailable — JWT-only ticket consume (dev/offline)');
    return { ok: true, payload: ticketPayload, devBypass: true };
  }
  const ticketKey = `gentk:${ticketPayload.nonce}`;
  const counterResult = await casWriteJson(
    store,
    ticketKey,
    (current) => {
      const used = (current?.chunksUsed || 0) + 1;
      if (used > ticketPayload.maxChunks) {
        return {
          skip: true,
          result: { error: 'chunks_exceeded', used, max: ticketPayload.maxChunks },
        };
      }
      return {
        payload: { chunksUsed: used, maxChunks: ticketPayload.maxChunks },
        result: { ok: true, chunksUsed: used, payload: ticketPayload },
      };
    },
    { logTag: '[gentk-session]' },
  ).catch((err) => {
    console.error('[genTicketLib] session counter CAS error:', err.message);
    return { error: 'counter_error', status: 503 };
  });

  if (counterResult?.error) {
    return {
      error: counterResult.error,
      status: 403,
      used: counterResult.used,
      max: counterResult.max,
    };
  }
  return { ok: true, payload: counterResult.result?.payload || ticketPayload };
}

function verifyGenTicketOrNull(genTicket) {
  const secret = getJwtSecret();
  if (!secret || !genTicket) return null;
  return verifyGenTicket(genTicket, secret);
}

module.exports = {
  consumeGenTicketSession,
  verifyGenTicketOrNull,
};
