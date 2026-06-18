'use strict';

/**
 * Reusable-parts store — Netlify Blobs.
 *
 * A "reusable part" is a self-contained exam section (one module/teil combo)
 * that can be served instantly without AI generation.
 *
 * Key layout (all in the shared 'lexicoil-data' store):
 *   reusable_part:{lang}:{level}:{module}:{id}        — full part payload
 *   reusable_part_idx:{lang}:{level}:{module}:{id}    — lightweight index entry
 *
 * This is intentionally parallel to (and does not touch) the exam pool.
 */

const { randomUUID } = require('crypto');
const { casWriteJson } = require('./casBlob.js');

const MAX_PER_SLOT  = 30;  // max stored parts per (lang, level, module)
const PART_SAMPLE   = 20;  // how many to consider when picking
const BURN_THRESHOLD = 50; // servedCount above which a part is treated as "well-used"

// ─── Key helpers ─────────────────────────────────────────────────────────────

function partPayloadKey(lang, level, module, id) {
  return `reusable_part:${lang}:${level}:${module}:${id}`;
}

function partIndexKey(lang, level, module, id) {
  return `reusable_part_idx:${lang}:${level}:${module}:${id}`;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function pickRandom(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

/**
 * List all index entries for (lang, level, module), sorted oldest-first.
 * Returns lightweight rows — does NOT load the full payloads.
 */
async function listPartsIndex(store, lang, level, module) {
  if (typeof store.list !== 'function') return [];
  const prefix = `reusable_part_idx:${lang}:${level}:${module}:`;
  let listed;
  try {
    listed = await store.list({ prefix });
  } catch (_) {
    return [];
  }
  const blobs = listed?.blobs || [];
  const entries = [];
  for (const blob of blobs) {
    try {
      const row = await store.get(blob.key, { type: 'json' });
      if (row?.partKey && row?.id) {
        entries.push({
          indexKey: blob.key,
          partKey:  row.partKey,
          id:       row.id,
          teil:     row.teil,
          complete: row.complete,
          verified: row.verified,
          createdAt:   row.createdAt || 0,
          servedCount: row.servedCount || 0,
          disabled:    row.disabled === true,
          contributor: row.contributor || null,
        });
      }
    } catch (_) {
      /* skip corrupt row */
    }
  }
  return entries.sort((a, b) => a.createdAt - b.createdAt);
}

/** Remove oldest entries when the slot exceeds MAX_PER_SLOT. */
async function rotatePartsByTimestamp(store, lang, level, module, entries) {
  if (entries.length <= MAX_PER_SLOT) return 0;
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const toRemove = sorted.slice(0, entries.length - MAX_PER_SLOT);
  let deleted = 0;
  for (const row of toRemove) {
    try {
      await store.delete(row.partKey);
      await store.delete(row.indexKey);
      deleted++;
    } catch (_) { /* ignore */ }
  }
  if (deleted > 0) {
    console.info(`[parts-store] rotated ${deleted} for ${lang}/${level}/${module}`);
  }
  return deleted;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Persist a new reusable part and update the append-only index.
 * Returns { partKey, idxKey, id }.
 *
 * Expected shape of `part`:
 *   { lang, level, module, teil, passage, questions, complete, verified,
 *     itemCount?, targetCount?, contributor?, createdAt?, id? }
 */
async function addReusablePart(store, part) {
  const lang    = String(part.lang   || '').toLowerCase();
  const level   = String(part.level  || '').toUpperCase();
  const module  = String(part.module || '').toLowerCase();
  const id      = part.id || randomUUID();
  const now     = Date.now();

  const payload = {
    id,
    lang,
    level,
    module,
    teil:        part.teil      ?? null,
    passage:     part.passage   || null,
    questions:   Array.isArray(part.questions) ? part.questions : [],
    complete:    !!part.complete,
    verified:    !!part.verified,
    itemCount:   part.itemCount    ?? (Array.isArray(part.questions) ? part.questions.length : 0),
    targetCount: part.targetCount  ?? (Array.isArray(part.questions) ? part.questions.length : 0),
    contributor: part.contributor  || null,
    createdAt:   part.createdAt    || now,
    disabled:    false,
    servedCount: 0,
  };

  const pKey = partPayloadKey(lang, level, module, id);
  const iKey = partIndexKey(lang, level, module, id);

  await store.setJSON(pKey, payload);

  const idxPayload = {
    partKey:     pKey,
    id,
    teil:        payload.teil,
    complete:    payload.complete,
    verified:    payload.verified,
    createdAt:   payload.createdAt,
    contributor: payload.contributor,
    disabled:    false,
    servedCount: 0,
  };
  const idxRes = await store.setJSON(iKey, idxPayload, { onlyIfNew: true });
  if (idxRes && idxRes.modified === false) {
    console.warn(`[parts-store] duplicate add id=${id} ${lang}/${level}/${module}`);
  }

  const entries = await listPartsIndex(store, lang, level, module);
  await rotatePartsByTimestamp(store, lang, level, module, entries);

  return { partKey: pKey, idxKey: iKey, id };
}

/**
 * Return the full payload of a single part, or null if not found.
 */
async function getReusablePart(store, lang, level, module, id) {
  const key = partPayloadKey(
    String(lang).toLowerCase(),
    String(level).toUpperCase(),
    String(module).toLowerCase(),
    id,
  );
  try {
    return await store.get(key, { type: 'json' });
  } catch (_) {
    return null;
  }
}

/**
 * Admin listing: full metadata for every part in the slot.
 * `module` is optional — if omitted, lists across all modules for lang/level.
 */
async function listReusablePartsAdmin(store, lang, level, module) {
  const normLang   = String(lang   || '').toLowerCase();
  const normLevel  = String(level  || '').toUpperCase();
  const normModule = module ? String(module).toLowerCase() : null;

  async function loadFromPrefix(prefix) {
    let listed;
    try { listed = await store.list({ prefix }); } catch (_) { return []; }
    const blobs = listed?.blobs || [];
    const out = [];
    for (const blob of blobs) {
      try {
        const row = await store.get(blob.key, { type: 'json' });
        if (!row?.partKey) continue;
        const part = await store.get(row.partKey, { type: 'json' });
        if (!part) continue;
        out.push(_summaryRow(row, part, part.lang || normLang, part.level || normLevel));
      } catch (_) { /* skip */ }
    }
    return out;
  }

  if (!normLang && !normLevel) {
    return (await loadFromPrefix('reusable_part_idx:'))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  if (!normModule) {
    const prefix = normLang && normLevel
      ? `reusable_part_idx:${normLang}:${normLevel}:`
      : normLang
        ? `reusable_part_idx:${normLang}:`
        : `reusable_part_idx:`;
    return (await loadFromPrefix(prefix))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  const entries = await listPartsIndex(store, normLang, normLevel, normModule);
  const out = [];
  for (const row of entries) {
    try {
      const part = await store.get(row.partKey, { type: 'json' });
      if (!part) continue;
      out.push(_summaryRow(row, part, normLang, normLevel));
    } catch (_) { /* skip */ }
  }
  return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function _summaryRow(row, part, lang, level) {
  return {
    id:          row.id,
    lang:        part.lang        || lang,
    level:       part.level       || level,
    module:      part.module      || '',
    teil:        part.teil        ?? null,
    complete:    !!part.complete,
    verified:    !!part.verified,
    itemCount:   part.itemCount   || 0,
    targetCount: part.targetCount || 0,
    contributor: part.contributor || null,
    createdAt:   part.createdAt   || row.createdAt || 0,
    servedCount: part.servedCount || 0,
    disabled:    part.disabled    === true,
  };
}

/**
 * Enable or disable a stored part.
 * Returns true on success, false if the part was not found.
 */
async function setReusablePartDisabled(store, lang, level, module, id, disabled) {
  const key = partPayloadKey(
    String(lang).toLowerCase(),
    String(level).toUpperCase(),
    String(module).toLowerCase(),
    id,
  );
  let part;
  try {
    part = await store.get(key, { type: 'json' });
  } catch (_) { return false; }
  if (!part) return false;
  part.disabled = !!disabled;
  await store.setJSON(key, part);
  return true;
}

/**
 * Delete a part and its index entry.
 * Returns true on success (or if blobs didn't exist).
 */
async function removeReusablePart(store, lang, level, module, id) {
  const pKey = partPayloadKey(
    String(lang).toLowerCase(),
    String(level).toUpperCase(),
    String(module).toLowerCase(),
    id,
  );
  const iKey = partIndexKey(
    String(lang).toLowerCase(),
    String(level).toUpperCase(),
    String(module).toLowerCase(),
    id,
  );
  try {
    await store.delete(pKey);
    await store.delete(iKey);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Pick a random non-disabled part for the given slot, avoiding excludeIds.
 * Increments servedCount via CAS.
 *
 * Returns { id, part } or null if nothing is available.
 *
 * Options:
 *   excludeIds  {string[]}  IDs to skip (already seen by the user).
 */
async function pickReusablePart(store, lang, level, module, { excludeIds = [] } = {}) {
  const normLang   = String(lang).toLowerCase();
  const normLevel  = String(level).toUpperCase();
  const normModule = String(module).toLowerCase();

  const entries = await listPartsIndex(store, normLang, normLevel, normModule);
  if (!entries.length) return null;

  const exclude    = new Set(excludeIds);
  const available  = entries.filter((e) => !e.disabled);
  if (!available.length) return null;

  const recent     = available.slice(-PART_SAMPLE);
  const candidates = pickRandom(recent, Math.min(recent.length, PART_SAMPLE)).filter(
    (row) => !exclude.has(row.id),
  );
  if (!candidates.length) {
    // All candidates were excluded — retry without exclude (dedup retry)
    const fallback = pickRandom(recent, Math.min(recent.length, PART_SAMPLE));
    if (!fallback.length) return null;
    candidates.push(...fallback);
  }

  // Load payloads, prefer low servedCount
  const loaded = [];
  for (const row of candidates) {
    try {
      const part = await store.get(row.partKey, { type: 'json' });
      if (part && !part.disabled) {
        loaded.push({ key: row.partKey, part, id: row.id });
      }
    } catch (_) { /* skip */ }
  }
  if (!loaded.length) return null;

  const fresh = loaded.filter((e) => (e.part.servedCount || 0) <= BURN_THRESHOLD);
  const pool  = fresh.length ? fresh : loaded;
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  // CAS-increment servedCount
  try {
    return await casWriteJson(
      store,
      chosen.key,
      (current) => {
        const base    = current || chosen.part;
        const payload = {
          ...base,
          servedCount:  (base.servedCount  || 0) + 1,
          lastServedAt: Date.now(),
        };
        return {
          payload,
          result: { id: chosen.id, part: payload },
        };
      },
      { logTag: '[parts-serve]' },
    );
  } catch (_) {
    // non-CAS fallback
    const part = {
      ...chosen.part,
      servedCount:  (chosen.part.servedCount  || 0) + 1,
      lastServedAt: Date.now(),
    };
    await store.setJSON(chosen.key, part);
    return { id: chosen.id, part };
  }
}

module.exports = {
  MAX_PER_SLOT,
  PART_SAMPLE,
  BURN_THRESHOLD,
  partPayloadKey,
  partIndexKey,
  addReusablePart,
  getReusablePart,
  listReusablePartsAdmin,
  setReusablePartDisabled,
  removeReusablePart,
  pickReusablePart,
};
