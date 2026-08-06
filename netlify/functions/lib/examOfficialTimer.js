'use strict';

const crypto = require('crypto');

const SESSION_TTL_MS = 26 * 60 * 60 * 1000; // official exams ≤ ~3h + buffer
const GRACE_SEC = 120;
const GRACE_PCT = 0.05;

function timerKey(userId, examSavedId) {
  return `exam_timer:${userId}:${String(examSavedId).slice(0, 120)}`;
}

function graceMs(limitMinutes) {
  const limitMs = limitMinutes * 60 * 1000;
  return Math.max(GRACE_SEC * 1000, Math.floor(limitMs * GRACE_PCT));
}

/**
 * Start or resume official exam timer (server clock).
 * Reuses existing session for same examSavedId if still valid and not finished.
 */
async function startOfficialTimer(store, { userId, email, examSavedId, limitMinutes, goalId }) {
  if (!store || !userId || !examSavedId) return { ok: false, error: 'invalid_fields' };
  const limit = Math.max(1, Math.min(Number(limitMinutes) || 90, 300));
  const key = timerKey(userId, examSavedId);
  const now = Date.now();

  let existing = null;
  try {
    existing = await store.get(key, { type: 'json' });
  } catch (_) {
    existing = null;
  }

  if (
    existing &&
    !existing.finishedAt &&
    existing.startedAt &&
    now - existing.startedAt < SESSION_TTL_MS &&
    Number(existing.limitMinutes) === limit
  ) {
    return {
      ok: true,
      resumed: true,
      timerSessionId: existing.timerSessionId,
      startedAt: existing.startedAt,
      limitMinutes: existing.limitMinutes,
      graceSec: Math.ceil(graceMs(limit) / 1000),
    };
  }

  const timerSessionId = crypto.randomBytes(16).toString('hex');
  const payload = {
    timerSessionId,
    userId,
    email: email || null,
    examSavedId: String(examSavedId),
    goalId: goalId ? String(goalId).slice(0, 80) : null,
    limitMinutes: limit,
    startedAt: now,
    finishedAt: null,
    serverTimeExceeded: null,
  };
  await store.setJSON(key, payload);

  return {
    ok: true,
    resumed: false,
    timerSessionId,
    startedAt: now,
    limitMinutes: limit,
    graceSec: Math.ceil(graceMs(limit) / 1000),
  };
}

/**
 * Finish timer — compare server elapsed vs limit + grace.
 * Does not block submission; returns advisory flags only.
 */
async function finishOfficialTimer(store, { userId, timerSessionId, examSavedId }) {
  if (!store || !userId || !examSavedId) return { ok: false, error: 'invalid_fields' };

  const key = timerKey(userId, examSavedId);
  let session = null;
  try {
    session = await store.get(key, { type: 'json' });
  } catch (_) {
    session = null;
  }

  if (!session || session.timerSessionId !== timerSessionId) {
    return {
      ok: true,
      validated: false,
      reason: 'session_not_found',
      serverTimeExceeded: null,
    };
  }

  const now = Date.now();
  const startedAt = Number(session.startedAt) || now;
  const limitMinutes = Number(session.limitMinutes) || 90;
  const limitMs = limitMinutes * 60 * 1000;
  const elapsedMs = now - startedAt;
  const allowedMs = limitMs + graceMs(limitMinutes);
  const serverTimeExceeded = elapsedMs > allowedMs;

  session.finishedAt = now;
  session.serverElapsedSec = Math.round(elapsedMs / 1000);
  session.serverTimeExceeded = serverTimeExceeded;
  session.serverLimitSec = Math.round(limitMs / 1000);
  session.serverGraceSec = Math.round(graceMs(limitMinutes) / 1000);
  await store.setJSON(key, session);

  return {
    ok: true,
    validated: true,
    serverTimeExceeded,
    serverElapsedSec: session.serverElapsedSec,
    serverLimitSec: session.serverLimitSec,
    serverGraceSec: session.serverGraceSec,
    startedAt,
    finishedAt: now,
  };
}

module.exports = {
  GRACE_SEC,
  GRACE_PCT,
  timerKey,
  startOfficialTimer,
  finishOfficialTimer,
};
