'use strict';

/**
 * In-process Gemini rate limiter for Netlify Functions (RPM + soft RPD).
 * Mirrors scripts/lib/geminiRateLimit.mjs defaults — tune via GEMINI_RPM / GEMINI_RPD
 * when billing is enabled (no code changes required).
 */
class DailyQuotaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DailyQuotaError';
  }
}

let chain = Promise.resolve();
let lastCallAt = 0;
let dailyCount = 0;
let dailyKey = '';

function ptDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function rpmLimit() {
  const model = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite');
  const def = model.includes('lite') ? 15 : 10;
  return Math.max(1, Number(process.env.GEMINI_RPM) || def);
}

function rpdLimit() {
  const n = Number(process.env.GEMINI_RPD);
  return Number.isFinite(n) && n >= 0 ? n : 250;
}

function resetDailyIfNeeded() {
  const day = ptDateKey();
  if (day !== dailyKey) {
    dailyKey = day;
    dailyCount = 0;
  }
}

/** Serialize requests and enforce RPM/RPD before one Gemini call. */
async function acquire() {
  const rpm = rpmLimit();
  const rpd = rpdLimit();
  const minSpacingMs = Math.ceil(60000 / rpm);

  resetDailyIfNeeded();
  if (rpd <= 0) {
    throw new DailyQuotaError('Gemini daily quota disabled (GEMINI_RPD=0)');
  }

  const run = async () => {
    resetDailyIfNeeded();
    if (dailyCount >= rpd) {
      throw new DailyQuotaError(`Gemini daily quota reached (${dailyCount}/${rpd})`);
    }

    const now = Date.now();
    const waitMs = Math.max(0, minSpacingMs - (now - lastCallAt));
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

    lastCallAt = Date.now();
    dailyCount += 1;
  };

  chain = chain.then(run, run);
  await chain;
}

function isDailyQuotaMessage(message) {
  return /per day|PerDay|RPD|free_tier.*day|daily|GenerateRequestsPerDay/i.test(String(message || ''));
}

module.exports = {
  acquire,
  DailyQuotaError,
  isDailyQuotaMessage,
  rpmLimit,
  rpdLimit,
};
