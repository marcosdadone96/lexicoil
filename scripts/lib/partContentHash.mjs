/**
 * Canonical content hash for reusable exam parts (publish + integrity checks).
 * Hashes normalized snapshot fields only — excludes runtime/volatile metadata.
 */
import crypto from 'node:crypto';

const VOLATILE_KEYS = new Set([
  'servedCount',
  'lastServedAt',
  'disabled',
  'createdAt',
  'contributor',
  'schemaVersion',
  '_deprecated',
  '_deprecatedReason',
  '_deprecatedAt',
]);

/**
 * Strip volatile fields and keep content-bearing payload (blob or seed shape).
 * @param {object} raw
 * @returns {object}
 */
export function normalizePartSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (VOLATILE_KEYS.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** @param {object} payload — blob or seed record (normalized before hash) */
export function canonicalPartHash(payload) {
  const snap = normalizePartSnapshot(payload);
  return crypto.createHash('sha256').update(stableStringify(snap)).digest('hex');
}

export function shortHash(hash, len = 12) {
  return String(hash || '').slice(0, len);
}
