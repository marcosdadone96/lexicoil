/**
 * Gemini rate limiter for CLI — global blob CAS when NETLIFY_SITE_ID set, else local file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { resolveGeminiRateLimitStore } from './geminiBlobStore.mjs';

const require = createRequire(import.meta.url);
const core = require('../../netlify/functions/lib/geminiRateLimitCore.js');

export const DailyQuotaError = core.DailyQuotaError;
export const USAGE_FILE = path.join(ROOT, 'batches', '.gemini-usage.json');
export const USAGE_BLOB_KEY = core.USAGE_BLOB_KEY;

export function isDailyQuotaMessage(message) {
  return core.isDailyQuotaMessage(message);
}

export function remainingToday() {
  const { store } = resolveGeminiRateLimitStore();
  if (store) {
    return core.readUsage(store).then(core.remainingTodayFromUsage);
  }
  const usage = core.readUsage(null, { filePath: USAGE_FILE });
  return Promise.resolve(core.remainingTodayFromUsage(usage));
}

/** Wait until RPM/RPD allow one request; then record it (global when Blobs available). */
export async function acquire() {
  const { store } = resolveGeminiRateLimitStore();
  if (store) {
    return core.acquire(store);
  }
  return core.acquire(null, { filePath: USAGE_FILE });
}

/** Sync read for doctor / diagnostics. */
export function readUsageSnapshot() {
  const { store, backend } = resolveGeminiRateLimitStore();
  if (store) {
    return core.readUsage(store).then((u) => ({ ...u, backend }));
  }
  const usage = core.readUsage(null, { filePath: USAGE_FILE });
  return Promise.resolve({ ...usage, backend: fs.existsSync(USAGE_FILE) ? 'file' : 'file-new' });
}
