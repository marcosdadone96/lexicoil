/**
 * poolPublishLock.mjs — serialized writes to reusable-seed pool files.
 *
 * Strategy:
 *   1. Netlify Blobs CAS lock (`pool_publish_lock:{lang}_{level}`) when store available.
 *   2. Local exclusive lock file (`{poolFile}.lock`) for CLI / tests without Blobs.
 *   3. Failed acquire → enqueue job in `pool_publish_queue:{lang}_{level}` (blob only).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const LOCK_TTL_MS = Number(process.env.POOL_PUBLISH_LOCK_TTL_MS || 120000);
const LOCK_POLL_MS = 150;

function maxAcquireAttempts() {
  return Number(process.env.POOL_PUBLISH_LOCK_ATTEMPTS || 40);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function lockKey(lang, level) {
  return `pool_publish_lock:${String(lang).toLowerCase()}_${String(level).toUpperCase()}`;
}

export function queueKey(lang, level) {
  return `pool_publish_queue:${String(lang).toLowerCase()}_${String(level).toUpperCase()}`;
}

function holderId() {
  return `pub_${crypto.randomUUID().slice(0, 12)}`;
}

function now() {
  return Date.now();
}

/** @param {import('@netlify/blobs').Store | null} store */
async function readBlobLock(store, lang, level) {
  if (!store) return null;
  try {
    return await store.get(lockKey(lang, level), { type: 'json' });
  } catch {
    return null;
  }
}

/** @param {import('@netlify/blobs').Store | null} store */
async function tryAcquireBlobLock(store, lang, level, holder) {
  if (!store || typeof store.getWithMetadata !== 'function') return false;
  const key = lockKey(lang, level);
  const t = now();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await store.getWithMetadata(key, { type: 'json' });
    const data = res?.data || null;
    const etag = res?.etag || null;
    const expired = !data?.holder || !data?.expiresAt || data.expiresAt < t;
    if (!expired && data.holder !== holder) {
      return false;
    }
    const payload = { holder, acquiredAt: t, expiresAt: t + LOCK_TTL_MS, version: (data?.version || 0) + 1 };
    const writeOpts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    try {
      const wr = await store.setJSON(key, payload, writeOpts);
      if (wr && wr.modified === false) {
        await sleep(20 * attempt);
        continue;
      }
      return true;
    } catch {
      await sleep(20 * attempt);
    }
  }
  return false;
}

/** @param {import('@netlify/blobs').Store | null} store */
async function releaseBlobLock(store, lang, level, holder) {
  if (!store) return;
  const key = lockKey(lang, level);
  try {
    const res = await store.getWithMetadata(key, { type: 'json' });
    if (!res?.data || res.data.holder !== holder) return;
    await store.delete(key);
  } catch {
    /* best effort */
  }
}

function tryAcquireFileLock(poolFile, holder) {
  const lockPath = `${poolFile}.lock`;
  fs.mkdirSync(path.dirname(poolFile), { recursive: true });
  const t = now();
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(
      fd,
      JSON.stringify({ holder, acquiredAt: t, expiresAt: t + LOCK_TTL_MS }),
    );
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err?.code !== 'EEXIST') return false;
    try {
      const raw = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (!raw?.expiresAt || raw.expiresAt < t) {
        fs.unlinkSync(lockPath);
        return tryAcquireFileLock(poolFile, holder);
      }
    } catch {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    }
    return false;
  }
}

function releaseFileLock(poolFile, holder) {
  const lockPath = `${poolFile}.lock`;
  try {
    if (!fs.existsSync(lockPath)) return;
    const raw = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (raw?.holder === holder) fs.unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

/** @param {import('@netlify/blobs').Store | null} store */
export async function enqueuePoolPublishJob(store, lang, level, job) {
  if (!store) {
    throw new Error('pool_publish_queue_requires_blob_store');
  }
  const key = queueKey(lang, level);
  const entry = { ...job, enqueuedAt: now(), id: job.id || crypto.randomUUID() };
  for (let attempt = 1; attempt <= 8; attempt++) {
    const res = await store.getWithMetadata(key, { type: 'json' });
    const data = res?.data && typeof res.data === 'object' ? res.data : { jobs: [] };
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    jobs.push(entry);
    const payload = { jobs: jobs.slice(-200), updatedAt: now() };
    const writeOpts = res?.etag ? { onlyIfMatch: res.etag } : { onlyIfNew: !res?.data };
    try {
      const wr = await store.setJSON(key, payload, writeOpts);
      if (wr && wr.modified === false) {
        await sleep(30 * attempt);
        continue;
      }
      return entry;
    } catch {
      await sleep(30 * attempt);
    }
  }
  throw new Error('pool_publish_queue_cas_exhausted');
}

/** @param {import('@netlify/blobs').Store | null} store */
export async function drainPoolPublishQueue(store, lang, level, handler) {
  if (!store) return { processed: 0 };
  const key = queueKey(lang, level);
  let res;
  try {
    res = await store.getWithMetadata(key, { type: 'json' });
  } catch {
    return { processed: 0 };
  }
  const jobs = Array.isArray(res?.data?.jobs) ? [...res.data.jobs] : [];
  if (!jobs.length) return { processed: 0 };

  let processed = 0;
  const remaining = [];
  for (const job of jobs) {
    try {
      const r = await handler(job);
      if (r?.queued) {
        remaining.push(r.job || job);
      } else if (r?.permanent || r?.deadLettered) {
        processed++;
      } else {
        processed++;
      }
    } catch (err) {
      console.error('[pool-publish-queue] job failed:', job.id, err.message);
      remaining.push({ ...job, lastError: err.message, retries: (job.retries || 0) + 1 });
    }
  }

  const payload = { jobs: remaining, updatedAt: now() };
  for (let attempt = 1; attempt <= 8; attempt++) {
    const fresh = attempt === 1 ? res : await store.getWithMetadata(key, { type: 'json' });
    const writeOpts = fresh?.etag ? { onlyIfMatch: fresh.etag } : {};
    try {
      const wr = await store.setJSON(key, payload, writeOpts);
      if (wr && wr.modified === false) {
        await sleep(30 * attempt);
        continue;
      }
      break;
    } catch {
      await sleep(30 * attempt);
    }
  }
  return { processed, remaining: remaining.length };
}

/**
 * Run fn while holding the pool publish lock for (lang, level).
 * @param {{ store?: object|null, poolFile: string, lang?: string, level?: string, holder?: string, onQueued?: Function }} opts
 */
export async function withPoolPublishLock(fn, opts = {}) {
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const poolFile = opts.poolFile;
  const store = opts.store || null;
  const holder = opts.holder || holderId();

  for (let attempt = 1; attempt <= maxAcquireAttempts(); attempt++) {
    let blobHeld = false;
    let fileHeld = false;
    try {
      if (store) {
        blobHeld = await tryAcquireBlobLock(store, lang, level, holder);
        if (!blobHeld) {
          await sleep(LOCK_POLL_MS + attempt * 25);
          continue;
        }
      }
      fileHeld = tryAcquireFileLock(poolFile, holder);
      if (!fileHeld) {
        if (blobHeld) await releaseBlobLock(store, lang, level, holder);
        await sleep(LOCK_POLL_MS + attempt * 25);
        continue;
      }
      return await fn({ holder, attempt });
    } finally {
      if (fileHeld) releaseFileLock(poolFile, holder);
      if (blobHeld && store) await releaseBlobLock(store, lang, level, holder);
    }
  }

  if (store && opts.enqueueOnTimeout !== false) {
    const job = await enqueuePoolPublishJob(store, lang, level, {
      type: opts.jobType || 'append',
      poolFile,
      lang,
      level,
      payload: opts.jobPayload || null,
    });
    if (typeof opts.onQueued === 'function') opts.onQueued(job);
    return { queued: true, jobId: job.id };
  }

  throw new Error(`pool_publish_lock_timeout:${lang}_${level}`);
}

export async function isPoolPublishLocked(store, lang, level, poolFile) {
  const t = now();
  const blob = await readBlobLock(store, lang, level);
  if (blob?.expiresAt > t) return { locked: true, holder: blob.holder, source: 'blob' };
  const lockPath = `${poolFile}.lock`;
  if (fs.existsSync(lockPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (raw?.expiresAt > t) return { locked: true, holder: raw.holder, source: 'file' };
    } catch {
      /* ignore */
    }
  }
  return { locked: false };
}
