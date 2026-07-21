/**
 * poolPublishQueue.mjs — real drain/retry for pool_publish_queue jobs.
 *
 * Replays full record payloads under the publish lock (not a log-and-drop stub).
 * Backoff on lock contention; dead-letter + status blob on permanent failure.
 */
import { createRequire } from 'node:module';
import {
  drainPoolPublishQueue,
  withPoolPublishLock,
  queueKey,
} from './poolPublishLock.mjs';
import { appendRecordToPoolUnlocked, defaultPoolFile } from './publishToPool.mjs';

const require = createRequire(import.meta.url);

const DEFAULT_MAX_DRAIN_RETRIES = 12;
const DEFAULT_BASE_BACKOFF_MS = 2000;

function maxDrainRetries() {
  return Number(process.env.POOL_PUBLISH_QUEUE_MAX_RETRIES || DEFAULT_MAX_DRAIN_RETRIES);
}

function baseBackoffMs() {
  return Number(process.env.POOL_PUBLISH_QUEUE_BACKOFF_MS || DEFAULT_BASE_BACKOFF_MS);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function now() {
  return Date.now();
}

function backoffMs(retries) {
  const exp = Math.min(baseBackoffMs() * 2 ** Math.max(0, retries - 1), 120000);
  return exp + Math.floor(Math.random() * 500);
}

export function deadLetterKey(lang, level) {
  return `pool_publish_dead_letter:${String(lang).toLowerCase()}_${String(level).toUpperCase()}`;
}

export function queueStatusKey(lang, level) {
  return `pool_publish_queue_status:${String(lang).toLowerCase()}_${String(level).toUpperCase()}`;
}

/** @param {import('@netlify/blobs').Store} store */
async function appendDeadLetter(store, lang, level, entry) {
  const key = deadLetterKey(lang, level);
  for (let attempt = 1; attempt <= 8; attempt++) {
    const res = await store.getWithMetadata(key, { type: 'json' });
    const data = res?.data && typeof res.data === 'object' ? res.data : { entries: [] };
    const entries = Array.isArray(data.entries) ? data.entries : [];
    entries.push({ ...entry, loggedAt: now() });
    const payload = { entries: entries.slice(-100), updatedAt: now() };
    const writeOpts = res?.etag ? { onlyIfMatch: res.etag } : { onlyIfNew: !res?.data };
    try {
      const wr = await store.setJSON(key, payload, writeOpts);
      if (wr && wr.modified === false) {
        await sleep(30 * attempt);
        continue;
      }
      return;
    } catch {
      await sleep(30 * attempt);
    }
  }
  console.error('[pool-publish-queue] dead_letter_cas_exhausted', entry?.id || entry?.jobId);
}

/** @param {import('@netlify/blobs').Store} store */
async function updateQueueStatus(store, lang, level, patch) {
  const key = queueStatusKey(lang, level);
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await store.getWithMetadata(key, { type: 'json' });
    const prev = res?.data && typeof res.data === 'object' ? res.data : {};
    const payload = { ...prev, ...patch, updatedAt: now() };
    const writeOpts = res?.etag ? { onlyIfMatch: res.etag } : { onlyIfNew: !res?.data };
    try {
      const wr = await store.setJSON(key, payload, writeOpts);
      if (wr && wr.modified === false) {
        await sleep(20 * attempt);
        continue;
      }
      return;
    } catch {
      await sleep(20 * attempt);
    }
  }
}

function scheduleRetry(job, lastError) {
  const retries = (job.retries || 0) + 1;
  if (retries >= maxDrainRetries()) {
    return { permanent: true, error: lastError || 'max_retries_exhausted', retries, jobId: job.id };
  }
  const nextRetryAt = now() + backoffMs(retries);
  console.warn(
    `[pool-publish-queue] retry ${retries}/${maxDrainRetries()} job=${job.id} at=${new Date(nextRetryAt).toISOString()} err=${lastError}`,
  );
  return {
    queued: true,
    job: { ...job, retries, lastError, nextRetryAt },
    nextRetryAt,
    lastError,
  };
}

/**
 * Process one queued publish job — real append under lock.
 * @param {import('@netlify/blobs').Store|null} store
 */
export async function processQueuedPublishJob(store, job) {
  const record = job.payload?.record;
  const publishOpts = job.payload?.publishOpts || {};
  const lang = String(job.lang || record?.lang || 'de').toLowerCase();
  const level = String(job.level || record?.level || 'B1').toUpperCase();
  const poolFile = job.poolFile || defaultPoolFile(lang, level);

  if (job.type !== 'append_record') {
    return { permanent: true, error: `unsupported_job_type:${job.type}`, jobId: job.id };
  }

  if (!record?.id) {
    return { permanent: true, error: 'missing_record_payload', jobId: job.id };
  }

  const nextRetryAt = Number(job.nextRetryAt || 0);
  if (nextRetryAt > now()) {
    return { queued: true, job, defer: true };
  }

  try {
    const result = await withPoolPublishLock(
      () => appendRecordToPoolUnlocked(record, { store, poolFile, lang, level, ...publishOpts }),
      { store, poolFile, lang, level, enqueueOnTimeout: false },
    );

    if (result?.ok) {
      if (store) {
        await updateQueueStatus(store, lang, level, {
          lastSuccess: { id: result.id, jobId: job.id, at: now(), duplicate: !!result.duplicate },
        });
      }
      return { ok: true, id: result.id, duplicate: result.duplicate };
    }

    if (result?.reason === 'pool_dedup') {
      return { ok: true, skipped: true, reason: 'pool_dedup', similarTo: result.similarTo };
    }

    return scheduleRetry(job, result?.error || result?.reason || 'publish_failed');
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('pool_publish_lock_timeout')) {
      return scheduleRetry(job, msg);
    }
    throw err;
  }
}

/**
 * Drain all pending jobs for (lang, level) with real publish + dead-letter on exhaustion.
 * @param {import('@netlify/blobs').Store} store
 */
export async function drainQueuedPoolPublishes(store, lang = 'de', level = 'B1') {
  if (!store) return { processed: 0, remaining: 0, deadLettered: 0 };

  let totalProcessed = 0;
  let totalDeadLettered = 0;
  let rounds = 0;
  const maxRounds = 50;

  while (rounds < maxRounds) {
    rounds++;
    const drained = await drainPoolPublishQueue(store, lang, level, async (job) => {
      const r = await processQueuedPublishJob(store, job);
      if (r?.permanent) {
        await appendDeadLetter(store, lang, level, {
          jobId: job.id,
          recordId: job.payload?.recordId || job.payload?.record?.id,
          error: r.error,
          retries: r.retries,
          lastError: job.lastError,
          enqueuedAt: job.enqueuedAt,
        });
        await updateQueueStatus(store, lang, level, {
          lastDeadLetter: {
            jobId: job.id,
            recordId: job.payload?.recordId || job.payload?.record?.id,
            error: r.error,
            at: now(),
          },
        });
        console.error(
          `[pool-publish-queue] DEAD_LETTER job=${job.id} record=${job.payload?.recordId || job.payload?.record?.id} err=${r.error}`,
        );
        totalDeadLettered++;
        return { deadLettered: true };
      }
      return r;
    });

    totalProcessed += drained.processed || 0;

    const status = await getPoolPublishQueueStatus(store, lang, level);
    if (status.pending === 0) break;

    const jobs = status.jobs || [];
    const nextAt = jobs.reduce((min, j) => {
      const t = Number(j.nextRetryAt || 0);
      return t > now() ? Math.min(min, t) : min;
    }, Infinity);

    if (nextAt !== Infinity && nextAt > now()) {
      const wait = Math.min(nextAt - now() + 50, 5000);
      await sleep(wait);
      continue;
    }

    if ((drained.processed || 0) === 0) {
      await sleep(250);
    }
  }

  const status = await getPoolPublishQueueStatus(store, lang, level);
  return {
    processed: totalProcessed,
    deadLettered: totalDeadLettered,
    remaining: status.pending,
    rounds,
  };
}

/** @param {import('@netlify/blobs').Store} store */
export async function getPoolPublishQueueStatus(store, lang = 'de', level = 'B1') {
  const qKey = queueKey(lang, level);
  const sKey = queueStatusKey(lang, level);
  const dKey = deadLetterKey(lang, level);
  const [queue, status, dead] = await Promise.all([
    store.get(qKey, { type: 'json' }).catch(() => null),
    store.get(sKey, { type: 'json' }).catch(() => null),
    store.get(dKey, { type: 'json' }).catch(() => null),
  ]);
  const jobs = Array.isArray(queue?.jobs) ? queue.jobs : [];
  const deadEntries = Array.isArray(dead?.entries) ? dead.entries : [];
  return {
    pending: jobs.length,
    jobs: jobs.map((j) => ({
      id: j.id,
      recordId: j.payload?.recordId || j.payload?.record?.id,
      retries: j.retries || 0,
      nextRetryAt: j.nextRetryAt || null,
      lastError: j.lastError || null,
    })),
    status: status || null,
    deadLetterCount: deadEntries.length,
    deadLetterRecent: deadEntries.slice(-5),
  };
}

/** Verify queued records are present in pool file (for tests / ops). */
export function verifyQueuedRecordsInPool(poolFile, recordIds) {
  const fs = require('node:fs');
  const raw = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
  const ids = new Set((raw.records || []).map((r) => r.id));
  const missing = recordIds.filter((id) => !ids.has(id));
  const present = recordIds.filter((id) => ids.has(id));
  return { missing, present, allPresent: missing.length === 0 };
}
