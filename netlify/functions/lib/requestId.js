'use strict';

/** Parse client requestId for quota / AI credit idempotency (CAS). */
function parseRequestId(raw) {
  const requestId = typeof raw === 'string' ? raw.trim() : '';
  if (!requestId || requestId.length > 80) return null;
  return requestId;
}

module.exports = { parseRequestId };
