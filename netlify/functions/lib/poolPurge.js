'use strict';

/**
 * poolPurge — shared logic to scan/remove legacy or invalid pool entries
 * from the BLOBS store (the source of truth that production serves from).
 *
 * Used by BOTH:
 *   • scripts/purge-legacy-pool.mjs  (CLI / prod maintenance)
 *   • netlify/functions/admin-api.js (admin UI button)
 *
 * A pool exam is stored as two blobs:
 *   pool:{lang}:{level}:{id}       → the entry { lang, level, topic, exam, ... }
 *   pool_idx:{lang}:{level}:{id}   → the index row { examKey, createdAt }
 * Purging removes BOTH.
 *
 * NOTE: the admin Postgres table (lc_pool_exams) is NOT what serving reads, so
 * cleaning it alone has no effect on users. This module targets Blobs.
 */

const { listPoolIndexEntries, poolKeyId } = require('./poolIndex.js');

const LEGACY_ID_PREFIXES = ['curated_', 'seed_'];

/**
 * Classify a single pool entry. Returns { legacy: boolean, reasons: string[] }.
 * opts:
 *   idPrefixes   string[]  ids starting with any of these are legacy (default curated_/seed_)
 *   needsCuration boolean  treat exam.needsCuration === true as legacy (default true)
 *   invalid      boolean   treat entries failing isValidEntry as legacy (default true)
 *   ids          string[]  explicit ids to always purge
 *   isValidEntry fn        optional validator (entry) => boolean
 */
function classifyEntry(id, entry, opts = {}) {
  const reasons = [];
  const idPrefixes = opts.idPrefixes || LEGACY_ID_PREFIXES;
  const checkNeedsCuration = opts.needsCuration !== false;
  const checkInvalid = opts.invalid !== false;

  if (Array.isArray(opts.ids) && opts.ids.includes(id)) reasons.push('explicit_id');
  if (idPrefixes.some((p) => String(id).startsWith(p))) reasons.push('legacy_id_prefix');
  if (checkNeedsCuration && entry?.exam?.needsCuration === true) reasons.push('needs_curation');
  if (checkInvalid && typeof opts.isValidEntry === 'function') {
    try {
      if (!opts.isValidEntry(entry)) reasons.push('invalid_entry');
    } catch (_) {
      reasons.push('invalid_entry');
    }
  }
  return { legacy: reasons.length > 0, reasons };
}

/** Scan a level and return entries flagged for purge (no deletion). */
async function scanPool(store, lang, level, opts = {}) {
  const index = await listPoolIndexEntries(store, lang, level);
  const flagged = [];
  const kept = [];
  for (const row of index) {
    let entry = null;
    try {
      entry = await store.get(row.examKey, { type: 'json' });
    } catch (_) {
      /* unreadable → treat as invalid */
    }
    const id = row.id || poolKeyId(row.examKey);
    const verdict = classifyEntry(id, entry, opts);
    const record = {
      id,
      examKey: row.examKey,
      indexKey: row.indexKey,
      topic: entry?.topic || null,
      reasons: verdict.reasons,
    };
    if (verdict.legacy || entry == null) {
      if (entry == null) record.reasons.push('unreadable_blob');
      flagged.push(record);
    } else {
      kept.push(record);
    }
  }
  return { lang, level, total: index.length, flagged, kept };
}

/** Delete flagged entries (both exam blob and index blob). */
async function purgePool(store, lang, level, opts = {}) {
  const scan = await scanPool(store, lang, level, opts);
  const report = { lang, level, total: scan.total, candidates: scan.flagged.length, deleted: 0, errors: [], items: [] };
  if (opts.dryRun) {
    report.dryRun = true;
    report.items = scan.flagged;
    return report;
  }
  for (const row of scan.flagged) {
    try {
      await store.delete(row.examKey);
      await store.delete(row.indexKey);
      report.deleted++;
      report.items.push({ id: row.id, reasons: row.reasons });
    } catch (err) {
      report.errors.push({ id: row.id, error: err.message });
    }
  }
  return report;
}

module.exports = { classifyEntry, scanPool, purgePool, LEGACY_ID_PREFIXES };
