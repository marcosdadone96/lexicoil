'use strict';

/**
 * Sprechen voice (Gemini Live) eligibility.
 *
 * Default (no env): all Pro / Pro Max users.
 *
 * Optional restriction (same as before):
 *   SPEAKING_VOICE_PILOT_EMAILS — comma-separated allowlist
 *   SPEAKING_VOICE_PILOT_PERCENT — 0–100 deterministic bucket among Pro users
 *   When either is set, only allowlist + percent bucket qualify (not everyone).
 */
const crypto = require('crypto');

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function parseAllowlist() {
  const raw = String(process.env.SPEAKING_VOICE_PILOT_EMAILS || '');
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((e) => normalizeEmail(e))
      .filter(Boolean),
  );
}

function pilotPercent() {
  const n = Number(process.env.SPEAKING_VOICE_PILOT_PERCENT);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor(n)));
}

function isProPlan(plan) {
  const p = String(plan || '').toLowerCase();
  return p === 'pro' || p === 'pro_max';
}

function pilotRestrictionActive() {
  return parseAllowlist().size > 0 || pilotPercent() > 0;
}

/**
 * @param {string} email
 * @param {string} plan — resolved plan id
 */
function isSpeakingVoicePilotEligible(email, plan) {
  if (!isProPlan(plan)) return false;

  const norm = normalizeEmail(email);
  if (!norm) return false;

  // Open rollout: all Pro / Pro Max unless restriction env vars are set.
  if (!pilotRestrictionActive()) return true;

  const allowlist = parseAllowlist();
  if (allowlist.has(norm)) return true;

  const pct = pilotPercent();
  if (pct <= 0) return false;

  const hash = crypto.createHash('sha256').update(`lc:svp:${norm}`).digest();
  const bucket = hash.readUInt32BE(0) % 100;
  return bucket < pct;
}

function pilotConfigSummary() {
  const allowlist = parseAllowlist();
  const restricted = pilotRestrictionActive();
  return {
    allowlistCount: allowlist.size,
    percent: pilotPercent(),
    enabled: restricted,
    openToAllPro: !restricted,
  };
}

module.exports = {
  isSpeakingVoicePilotEligible,
  isProPlan,
  pilotConfigSummary,
  parseAllowlist,
  pilotPercent,
  pilotRestrictionActive,
};
