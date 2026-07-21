'use strict';

/**
 * vocabBgSweepQueue — event queue for vocab-bg-sweep (no full quota: scan).
 *
 * Users are enqueued when they have sweep-worthy state:
 *   • bgGenPending (stuck / missed background invoke)
 *   • bgVocabPendingCount >= BATCH_DAILY_MIN (daily safety net)
 *   • bulk import deferred trigger
 */
const { casWriteJson } = require('./casBlob.js');
const VocabBgState = require('./vocabBgState.js');

const QUEUE_KEY = 'vocab_bg_sweep_queue';
const MAX_QUEUE = 5000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Same filter the legacy sweep used before reading each quota blob. */
function recordNeedsSweep(rec) {
  if (!rec || typeof rec !== 'object') return false;
  if (rec.bgGenPending === true) return true;
  const count = Number(rec.bgVocabPendingCount);
  if (Number.isFinite(count) && count >= VocabBgState.BATCH_DAILY_MIN) return true;
  return false;
}

function mergeEntry(entries, email, reason) {
  const now = Date.now();
  const list = Array.isArray(entries) ? [...entries] : [];
  const idx = list.findIndex((e) => e.email === email);
  const row = {
    email,
    reason: reason || 'pending',
    enqueuedAt: now,
    lastTouchedAt: now,
  };
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...row, enqueuedAt: list[idx].enqueuedAt || now };
  } else {
    list.push(row);
  }
  list.sort((a, b) => (a.enqueuedAt || 0) - (b.enqueuedAt || 0));
  return list.slice(-MAX_QUEUE);
}

/**
 * @param {import('@netlify/blobs').Store} store
 */
async function enqueueVocabBgSweep(store, email, reason = 'pending') {
  if (!store) return null;
  const em = normEmail(email);
  if (!em) return null;
  return casWriteJson(
    store,
    QUEUE_KEY,
    (current) => {
      const data = current && typeof current === 'object' ? current : { entries: [] };
      const entries = mergeEntry(data.entries, em, reason);
      return {
        payload: { entries, updatedAt: Date.now() },
        result: { email: em, queued: true, size: entries.length },
      };
    },
    { logTag: '[vocab-bg-queue]', maxRetries: 8 },
  );
}

/**
 * @param {import('@netlify/blobs').Store} store
 */
async function removeVocabBgSweep(store, email) {
  if (!store) return;
  const em = normEmail(email);
  if (!em) return;
  await casWriteJson(
    store,
    QUEUE_KEY,
    (current) => {
      const data = current && typeof current === 'object' ? current : { entries: [] };
      const entries = (Array.isArray(data.entries) ? data.entries : []).filter((e) => e.email !== em);
      if (entries.length === (data.entries || []).length) {
        return { skip: true, result: { removed: false } };
      }
      return {
        payload: { entries, updatedAt: Date.now() },
        result: { removed: true, email: em },
      };
    },
    { logTag: '[vocab-bg-queue]', maxRetries: 6 },
  );
}

/**
 * Sync queue membership from quota record state.
 * @param {import('@netlify/blobs').Store} store
 */
async function syncVocabBgSweepQueue(store, email, rec, opts = {}) {
  if (!store) return null;
  const em = normEmail(email);
  if (!em) return null;
  const reason = opts.reason || 'sync';
  if (recordNeedsSweep(rec) || opts.forceEnqueue) {
    return enqueueVocabBgSweep(store, em, reason);
  }
  await removeVocabBgSweep(store, em);
  return { email: em, queued: false };
}

/**
 * @param {import('@netlify/blobs').Store} store
 */
async function listVocabBgSweepQueue(store) {
  if (!store) return [];
  try {
    const data = await store.get(QUEUE_KEY, { type: 'json' });
    return Array.isArray(data?.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

/**
 * Return next batch of emails to process (does not remove — sweep removes after attempt).
 * @param {import('@netlify/blobs').Store} store
 */
async function peekVocabBgSweepBatch(store, { limit = 50 } = {}) {
  const entries = await listVocabBgSweepQueue(store);
  return entries.slice(0, Math.max(1, limit)).map((e) => e.email).filter(Boolean);
}

/**
 * Legacy one-time rebuild — NOT used in scheduled sweep; for ops/migration only.
 * @param {import('@netlify/blobs').Store} store
 */
async function rebuildVocabBgSweepQueueFromQuota(store) {
  if (!store || typeof store.list !== 'function') return { rebuilt: 0 };
  const listed = await store.list({ prefix: 'quota:' });
  const keys = (listed?.blobs || []).map((b) => b.key);
  let rebuilt = 0;
  for (const qKey of keys) {
    const rec = await store.get(qKey, { type: 'json' }).catch(() => null);
    if (!recordNeedsSweep(rec)) continue;
    const email = qKey.replace(/^quota:/, '');
    await enqueueVocabBgSweep(store, email, 'rebuild');
    rebuilt++;
  }
  return { rebuilt };
}

module.exports = {
  QUEUE_KEY,
  recordNeedsSweep,
  enqueueVocabBgSweep,
  removeVocabBgSweep,
  syncVocabBgSweepQueue,
  listVocabBgSweepQueue,
  peekVocabBgSweepBatch,
  rebuildVocabBgSweepQueueFromQuota,
};
