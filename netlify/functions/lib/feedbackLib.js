'use strict';

const crypto = require('crypto');

const MIN_LEN = 5;
const MAX_LEN = 2000;
const MAX_LINKS = 3;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE_MAX = 80;

function normalizeMessage(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

function normalizePage(raw) {
  const p = String(raw || 'unknown').trim().slice(0, PAGE_MAX);
  return p || 'unknown';
}

function normalizeEmail(raw) {
  if (raw == null || raw === '') return null;
  const em = String(raw).trim().toLowerCase();
  if (!em) return null;
  return EMAIL_RE.test(em) ? em : null;
}

function countLinks(text) {
  const matches = String(text || '').match(/https?:\/\/|www\./gi);
  return matches ? matches.length : 0;
}

function looksLikeSpam(text) {
  if (countLinks(text) > MAX_LINKS) return 'too_many_links';
  const letters = text.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (letters.length >= 20) {
    const upper = letters.replace(/[^A-ZÀ-Ý]/g, '').length;
    if (upper / letters.length > 0.85) return 'spam_pattern';
  }
  return null;
}

function validateFeedbackPayload(body) {
  const message = normalizeMessage(body?.message);
  if (message.length < MIN_LEN) return { ok: false, error: 'message_too_short' };
  if (message.length > MAX_LEN) return { ok: false, error: 'message_too_long' };
  const spam = looksLikeSpam(message);
  if (spam) return { ok: false, error: spam };

  const emailRaw = body?.email;
  let email = null;
  if (emailRaw != null && String(emailRaw).trim()) {
    email = normalizeEmail(emailRaw);
    if (!email) return { ok: false, error: 'invalid_email' };
  }

  return {
    ok: true,
    message,
    email,
    page: normalizePage(body?.page),
  };
}

function ipHash(ip, salt) {
  return crypto
    .createHash('sha256')
    .update(String(ip || 'unknown') + ':' + String(salt || 'lexicoil-feedback'))
    .digest('hex')
    .slice(0, 20);
}

function clientIp(event) {
  const raw =
    event?.headers?.['x-forwarded-for'] ||
    event?.headers?.['X-Forwarded-For'] ||
    event?.headers?.['client-ip'] ||
    '';
  return String(raw).split(',')[0].trim() || 'unknown';
}

async function readRateEntry(store, key) {
  try {
    return await store.get(key, { type: 'json' });
  } catch (_) {
    return null;
  }
}

async function checkFeedbackRateLimit(store, { ipKey, userKey }) {
  const now = Date.now();
  const keys = [ipKey, userKey].filter(Boolean);

  for (const key of keys) {
    const entry = await readRateEntry(store, key);
    if (entry && now - entry.since < RATE_WINDOW_MS && entry.count >= RATE_LIMIT) {
      return false;
    }
  }

  for (const key of keys) {
    const entry = await readRateEntry(store, key);
    if (!entry || now - entry.since >= RATE_WINDOW_MS) {
      await store.setJSON(key, { count: 1, since: now });
    } else {
      entry.count += 1;
      await store.setJSON(key, entry);
    }
  }

  return true;
}

module.exports = {
  MIN_LEN,
  MAX_LEN,
  RATE_LIMIT,
  RATE_WINDOW_MS,
  normalizeMessage,
  validateFeedbackPayload,
  looksLikeSpam,
  countLinks,
  ipHash,
  clientIp,
  checkFeedbackRateLimit,
};
