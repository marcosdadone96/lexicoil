'use strict';

/**
 * Shared Gemini RPM/RPD limiter — blob CAS when store available, file fallback for CLI offline.
 * All serverless instances + CLI (with NETLIFY_SITE_ID) share gemini_ratelimit:global.
 */
const fs = require('node:fs');
const path = require('node:path');
const { casWriteJson } = require('./casBlob.js');

const USAGE_BLOB_KEY = 'gemini_ratelimit:global';

class DailyQuotaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DailyQuotaError';
  }
}

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeUsage(raw) {
  const day = ptDateKey();
  if (!raw || raw.day !== day) return { day, count: 0, timestamps: [] };
  return {
    day: raw.day,
    count: Number(raw.count) || 0,
    timestamps: (Array.isArray(raw.timestamps) ? raw.timestamps : []).map(Number).filter(Boolean),
  };
}

function computeWaitMs(usage, rpm) {
  const minSpacing = 60000 / rpm;
  const now = Date.now();
  const recent = usage.timestamps.filter((t) => now - t < 60000);
  let waitMs = 0;
  if (recent.length >= rpm) {
    waitMs = Math.max(waitMs, 60000 - (now - Math.min(...recent)) + 50);
  }
  if (recent.length > 0) {
    waitMs = Math.max(waitMs, minSpacing - (now - Math.max(...recent)) + 50);
  }
  return waitMs;
}

function readFileUsage(filePath) {
  const day = ptDateKey();
  try {
    if (!filePath || !fs.existsSync(filePath)) return { day, count: 0, timestamps: [] };
    return normalizeUsage(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return { day, count: 0, timestamps: [] };
  }
}

function writeFileUsage(filePath, data) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readBlobUsage(store) {
  try {
    const raw = await store.get(USAGE_BLOB_KEY, { type: 'json' });
    return normalizeUsage(raw);
  } catch {
    return normalizeUsage(null);
  }
}

/** @param {object|null} store Netlify Blobs store */
async function acquire(store, opts = {}) {
  const rpm = rpmLimit();
  const rpd = rpdLimit();
  const filePath = opts.filePath || null;

  if (rpd <= 0) {
    throw new DailyQuotaError('Gemini daily quota disabled (GEMINI_RPD=0)');
  }

  if (store) {
    return acquireViaBlob(store, { rpm, rpd });
  }
  return acquireViaFile(filePath, { rpm, rpd });
}

async function acquireViaBlob(store, { rpm, rpd }) {
  for (let outer = 0; outer < 120; outer++) {
    const usage = await readBlobUsage(store);
    if (usage.count >= rpd) {
      throw new DailyQuotaError(`Gemini daily quota reached (${usage.count}/${rpd})`);
    }

    const waitMs = computeWaitMs(usage, rpm);
    if (waitMs > 0) {
      await sleep(waitMs);
      continue;
    }

    const day = ptDateKey();
    const step = await casWriteJson(
      store,
      USAGE_BLOB_KEY,
      (current) => {
        const data = normalizeUsage(current);
        if (data.count >= rpd) {
          return { skip: true, result: { ok: false, reason: 'daily' } };
        }
        const ts = Date.now();
        const recent = data.timestamps.filter((t) => ts - t < 60000);
        if (recent.length >= rpm) {
          return { skip: true, result: { ok: false, reason: 'rpm' } };
        }
        const payload = {
          day,
          count: data.count + 1,
          timestamps: [...data.timestamps.filter((t) => ts - t < 600000), ts].slice(-rpm * 15),
        };
        return { payload, result: { ok: true } };
      },
      { maxRetries: 10, logTag: '[gemini-ratelimit]' },
    );

    if (step?.ok) return;
    if (step?.reason === 'daily') {
      throw new DailyQuotaError(`Gemini daily quota reached (${rpd})`);
    }
    await sleep(30 + outer * 5);
  }

  throw new Error('gemini_ratelimit_acquire_exhausted');
}

async function acquireViaFile(filePath, { rpm, rpd }) {
  const minSpacing = 60000 / rpm;

  for (let attempt = 0; attempt < 60; attempt++) {
    const usage = readFileUsage(filePath);
    if (usage.count >= rpd) {
      throw new DailyQuotaError(
        `Presupuesto diario de Gemini agotado (${usage.count}/${rpd} peticiones hoy PT). Reanuda mañana.`,
      );
    }

    const waitMs = computeWaitMs(usage, rpm);
    if (waitMs > 0) {
      await sleep(waitMs);
      continue;
    }

    const fresh = readFileUsage(filePath);
    if (fresh.count >= rpd) {
      throw new DailyQuotaError(
        `Presupuesto diario de Gemini agotado (${fresh.count}/${rpd} peticiones hoy PT). Reanuda mañana.`,
      );
    }

    const ts = Date.now();
    writeFileUsage(filePath, {
      day: fresh.day,
      count: fresh.count + 1,
      timestamps: [...fresh.timestamps.filter((t) => ts - t < 600000), ts].slice(-rpm * 15),
    });
    return;
  }

  throw new Error('No se pudo adquirir slot de rate limit tras varios intentos');
}

/** @param {object|null} store */
async function readUsage(store, opts = {}) {
  if (store) return readBlobUsage(store);
  return readFileUsage(opts.filePath || null);
}

function remainingTodayFromUsage(usage) {
  return Math.max(0, rpdLimit() - (usage?.count || 0));
}

function isDailyQuotaMessage(message) {
  return /per day|PerDay|RPD|free_tier.*day|daily|GenerateRequestsPerDay/i.test(String(message || ''));
}

module.exports = {
  USAGE_BLOB_KEY,
  DailyQuotaError,
  acquire,
  readUsage,
  remainingTodayFromUsage,
  isDailyQuotaMessage,
  rpmLimit,
  rpdLimit,
  ptDateKey,
};
