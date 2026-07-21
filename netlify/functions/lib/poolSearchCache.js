'use strict';

/**
 * In-memory pool search index — seed + blob index rows, cached per Lambda container.
 * Scoring uses vocabKeys on lightweight rows; full payloads load only for the winner.
 */
const { loadSeedRecords, clearLocalSeedCache: _clearSeedCache } = require('./reusablePartsLocalSeed.js');
const { useLocalSeedInRuntime } = require('./poolSourceMode.js');
const { partPassesPublishGate } = require('./partPublishGate.js');
const { partPassesAssembleMode } = require('./officialQuarantine.js');

const MODULE_CACHE = new Map();
const INDEX_READ_BATCH = 25;

function cacheKey(lang, level, module) {
  return `${String(lang).toLowerCase()}:${String(level).toUpperCase()}:${String(module).toLowerCase()}`;
}

function vocabKeysFromPart(part) {
  const { getPartVocabIndex, vocabEntryKeys } = require('./partIndex.js');
  const keys = new Set();
  for (const entry of getPartVocabIndex(part)) {
    for (const k of vocabEntryKeys(entry)) keys.add(k);
  }
  return [...keys];
}

function rowFromSeedRecord(rec) {
  return {
    id: rec.id,
    teil: Number(rec.teil),
    vocabKeys: vocabKeysFromPart(rec),
    topicTag: rec.topicTag || null,
    topicSlug: String(rec.topicSlug || rec.topic || '').toLowerCase(),
    servedCount: rec.servedCount || 0,
    complete: rec.complete === true,
    verified: rec.verified === true,
    disabled: rec.disabled === true,
    source: 'seed',
    part: rec,
    partKey: null,
    indexKey: null,
  };
}

function rowFromIndex(idx, partMeta = null) {
  const vocabKeys = Array.isArray(idx.vocabKeys) && idx.vocabKeys.length
    ? idx.vocabKeys.map((k) => String(k).toLowerCase())
    : (partMeta ? vocabKeysFromPart(partMeta) : []);
  return {
    id: idx.id,
    teil: Number(idx.teil),
    vocabKeys,
    topicTag: idx.topicTag || partMeta?.topicTag || null,
    topicSlug: String(idx.topicSlug || idx.topic || partMeta?.topicSlug || partMeta?.topic || '').toLowerCase(),
    servedCount: idx.servedCount || partMeta?.servedCount || 0,
    complete: idx.complete === true,
    verified: idx.verified === true,
    disabled: idx.disabled === true,
    source: 'blob',
    part: partMeta,
    partKey: idx.partKey || null,
    indexKey: idx.indexKey || null,
  };
}

async function readIndexRows(store, lang, level, module) {
  if (!store || typeof store.list !== 'function') return [];
  const prefix = `reusable_part_idx:${lang}:${level}:${module}:`;
  let listed;
  try {
    listed = await store.list({ prefix });
  } catch (_) {
    return [];
  }
  const blobs = listed?.blobs || [];
  const out = [];
  for (let i = 0; i < blobs.length; i += INDEX_READ_BATCH) {
    const batch = blobs.slice(i, i + INDEX_READ_BATCH);
    const chunk = await Promise.all(batch.map(async (blob) => {
      try {
        const idx = await store.get(blob.key, { type: 'json' });
        if (!idx?.id || !idx.partKey) return null;
        return { ...idx, indexKey: blob.key };
      } catch (_) {
        return null;
      }
    }));
    for (const idx of chunk) {
      if (!idx) continue;
      if (Array.isArray(idx.vocabKeys) && idx.vocabKeys.length && partPassesPublishGate(idx)) {
        out.push(rowFromIndex(idx, null));
        continue;
      }
      let partMeta = null;
      try {
        partMeta = await store.get(idx.partKey, { type: 'json' });
      } catch (_) { /* skip */ }
      if (!partPassesPublishGate(partMeta || idx)) continue;
      out.push(rowFromIndex(idx, partMeta));
    }
  }
  return out;
}

/**
 * Load (or return cached) searchable rows for a module slot.
 */
async function loadModuleSearchRows(store, lang, level, module) {
  const normLang = String(lang).toLowerCase();
  const normLevel = String(level).toUpperCase();
  const normModule = String(module).toLowerCase();
  const key = cacheKey(normLang, normLevel, normModule);
  if (MODULE_CACHE.has(key)) return MODULE_CACHE.get(key);

  const byId = new Map();
  if (useLocalSeedInRuntime()) {
    for (const rec of loadSeedRecords(normLang, normLevel)) {
      if (String(rec.module || '').toLowerCase() !== normModule) continue;
      if (!partPassesPublishGate(rec)) continue;
      byId.set(rec.id, rowFromSeedRecord(rec));
    }
  }

  for (const row of await readIndexRows(store, normLang, normLevel, normModule)) {
    byId.set(row.id, row);
  }

  const rows = [...byId.values()];
  const byTeil = new Map();
  for (const row of rows) {
    const t = Number(row.teil);
    if (!Number.isFinite(t)) continue;
    if (!byTeil.has(t)) byTeil.set(t, []);
    byTeil.get(t).push(row);
  }

  const entry = { rows, byTeil, loadedAt: Date.now() };
  MODULE_CACHE.set(key, entry);
  return entry;
}

function filterRows(rows, { teil = null, excludeIds = [], assembleMode = 'practice' } = {}) {
  const exclude = new Set(excludeIds || []);
  let out = rows.filter((r) => !r.disabled && r.complete && r.verified && !exclude.has(r.id));
  if (teil != null && Number.isFinite(Number(teil))) {
    const want = Number(teil);
    out = out.filter((r) => Number(r.teil) === want);
  }
  if (assembleMode === 'official') {
    out = out.filter((r) => partPassesAssembleMode(r.part, assembleMode));
  }
  return out;
}

function filterRowsByTopicTag(rows, topicTag, { normalizeB1Topic } = {}) {
  if (!topicTag || typeof normalizeB1Topic !== 'function') return rows;
  const want = normalizeB1Topic(topicTag);
  if (!want) return rows;
  const tagged = rows.filter((r) => normalizeB1Topic(r.topicTag) === want);
  return tagged.length ? tagged : rows;
}

function scoreRowsForVocab(rows, { words = [], excludeTopics = [] } = {}) {
  const want = new Set((words || []).map((w) => String(w).toLowerCase()).filter(Boolean));
  const topicsToAvoid = new Set((excludeTopics || []).map((t) => String(t).toLowerCase()));
  const scored = [];
  for (const row of rows) {
    const keys = row.part ? vocabKeysFromPart(row.part) : (row.vocabKeys || []);
    const covered = [];
    if (want.size) {
      for (const key of keys) {
        if (want.has(key)) covered.push(key);
      }
    }
    scored.push({
      row,
      covered,
      score: covered.length,
      topicPenalty: topicsToAvoid.has(row.topicSlug) ? 1 : 0,
    });
  }
  scored.sort((a, b) =>
    b.score - a.score ||
    a.topicPenalty - b.topicPenalty ||
    (a.row.servedCount || 0) - (b.row.servedCount || 0) ||
    Math.random() - 0.5,
  );
  return scored;
}

function pickRandomRow(rows, sampleSize) {
  if (!rows.length) return null;
  const n = Math.min(rows.length, sampleSize || rows.length);
  const copy = [...rows];
  const pool = [];
  while (copy.length && pool.length < n) {
    const i = Math.floor(Math.random() * copy.length);
    pool.push(copy.splice(i, 1)[0]);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

async function resolveRowPart(store, row) {
  if (row.part) return row.part;
  if (!row.partKey || !store) return null;
  try {
    const part = await store.get(row.partKey, { type: 'json' });
    if (part) row.part = part;
    return part;
  } catch (_) {
    return null;
  }
}

function clearPoolSearchCache(lang, level, module) {
  if (lang != null && level != null && module != null) {
    MODULE_CACHE.delete(cacheKey(lang, level, module));
    return;
  }
  MODULE_CACHE.clear();
}

function clearAllPoolCaches() {
  MODULE_CACHE.clear();
  _clearSeedCache();
}

module.exports = {
  INDEX_READ_BATCH,
  loadModuleSearchRows,
  filterRows,
  filterRowsByTopicTag,
  scoreRowsForVocab,
  pickRandomRow,
  resolveRowPart,
  vocabKeysFromPart,
  clearPoolSearchCache,
  clearAllPoolCaches,
};
