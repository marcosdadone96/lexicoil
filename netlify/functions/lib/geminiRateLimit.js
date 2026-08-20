'use strict';

/**
 * Gemini rate limiter for Netlify Functions — global blob CAS across all instances.
 */
const { getStore } = require('@netlify/blobs');
const { STORE_NAME } = require('./blobStore.js');
const {
  acquire: acquireCore,
  readUsage,
  remainingTodayFromUsage,
  DailyQuotaError,
  isDailyQuotaMessage,
  rpmLimit,
  rpdLimit,
  USAGE_BLOB_KEY,
} = require('./geminiRateLimitCore.js');

function getRateLimitStore() {
  try {
    return getStore(STORE_NAME);
  } catch (err) {
    console.warn('[gemini-ratelimit] blob store unavailable:', err.message);
    return null;
  }
}

async function acquire() {
  if (process.env.GEMINI_RATE_LIMIT_SKIP === '1' || process.env.GEMINI_RATE_LIMIT_SKIP === 'true') {
    return { skipped: true };
  }
  const store = getRateLimitStore();
  if (!store) {
    throw new Error('gemini_ratelimit_requires_blob_store');
  }
  return acquireCore(store);
}

async function remainingToday() {
  const store = getRateLimitStore();
  if (!store) return remainingTodayFromUsage({ count: 0 });
  const usage = await readUsage(store);
  return remainingTodayFromUsage(usage);
}

module.exports = {
  acquire,
  remainingToday,
  DailyQuotaError,
  isDailyQuotaMessage,
  rpmLimit,
  rpdLimit,
  USAGE_BLOB_KEY,
};
