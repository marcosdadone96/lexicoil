'use strict';

/**
 * Optimistic concurrency for Netlify Blobs (etag + onlyIfMatch / onlyIfNew).
 */
const MAX_CAS_RETRIES = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt) {
  const base = 15 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 20);
  return Math.min(base + jitter, 250);
}

async function readJsonWithEtag(store, key) {
  if (typeof store.getWithMetadata !== 'function') {
    const data = await store.get(key, { type: 'json' });
    return { data: data ?? null, etag: null };
  }
  const res = await store.getWithMetadata(key, { type: 'json' });
  if (!res) return { data: null, etag: null };
  return { data: res.data ?? null, etag: res.etag ?? null };
}

/**
 * @param {object} store Netlify Blobs store
 * @param {string} key blob key
 * @param {(current: object|null) => { skip?: boolean, result?: any, payload?: object }} mutate
 * @param {{ maxRetries?: number, logTag?: string, createIfMissing?: boolean }} opts
 */
async function casWriteJson(store, key, mutate, opts = {}) {
  const maxRetries = opts.maxRetries ?? MAX_CAS_RETRIES;
  const logTag = opts.logTag ?? '[cas]';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { data, etag } = await readJsonWithEtag(store, key);
    const step = mutate(data);
    if (step.skip) return step.result;

    const writeOpts = {};
    if (etag) writeOpts.onlyIfMatch = etag;
    else writeOpts.onlyIfNew = true;

    const res = await store.setJSON(key, step.payload, writeOpts);
    if (res && res.modified === false) {
      console.warn(`${logTag} conflict key=${key} attempt=${attempt}/${maxRetries}`);
      await sleep(backoffMs(attempt));
      continue;
    }

    if (attempt > 1) {
      console.info(`${logTag} resolved key=${key} after ${attempt} attempts`);
    }
    return step.result;
  }

  const err = new Error(`cas_write_exhausted:${key}`);
  err.code = 'cas_write_exhausted';
  throw err;
}

/** Idempotency record — separate key, onlyIfNew prevents double-charge on retry. */
async function writeIdempotentResult(store, idemKey, result) {
  const res = await store.setJSON(idemKey, result, { onlyIfNew: true });
  if (res && res.modified === false) {
    const existing = await store.get(idemKey, { type: 'json' });
    if (existing) return existing;
  }
  return result;
}

async function readIdempotentResult(store, idemKey) {
  try {
    return await store.get(idemKey, { type: 'json' });
  } catch (_) {
    return null;
  }
}

module.exports = {
  MAX_CAS_RETRIES,
  backoffMs,
  readJsonWithEtag,
  casWriteJson,
  writeIdempotentResult,
  readIdempotentResult,
};
