'use strict';

const { casWriteJson, readIdempotentResult, writeIdempotentResult } = require('./casBlob.js');

const MAX_PER_LEVEL = 50;
const POOL_SAMPLE = 20;
const BURN_THRESHOLD = 100;

function poolExamKey(lang, level, id) {
  return `pool:${lang}:${level}:${id}`;
}

/** Append-only index entry — one blob per exam, never rewrite a shared array. */
function poolIndexEntryKey(lang, level, id) {
  return `pool_idx:${lang}:${level}:${id}`;
}

/** Legacy shared index (pre phase 08) — migrated on read. */
function legacyPoolIndexKey(lang, level) {
  return `pool_index:${lang}:${level}`;
}

function poolKeyId(key) {
  return String(key || '').split(':').pop();
}

function pickRandom(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

async function listPoolIndexEntries(store, lang, level) {
  if (typeof store.list !== 'function') return [];
  const prefix = `pool_idx:${lang}:${level}:`;
  const listed = await store.list({ prefix });
  const blobs = listed?.blobs || [];
  const entries = [];
  for (const blob of blobs) {
    try {
      const row = await store.get(blob.key, { type: 'json' });
      if (row?.examKey) {
        entries.push({
          indexKey: blob.key,
          examKey: row.examKey,
          createdAt: row.createdAt || 0,
          id: poolKeyId(row.examKey),
        });
      }
    } catch (_) {
      /* skip corrupt index row */
    }
  }
  return entries.sort((a, b) => a.createdAt - b.createdAt);
}

async function migrateLegacyPoolIndex(store, lang, level) {
  const legacyKey = legacyPoolIndexKey(lang, level);
  let legacy = [];
  try {
    legacy = (await store.get(legacyKey, { type: 'json' })) || [];
  } catch (_) {
    return 0;
  }
  if (!Array.isArray(legacy) || !legacy.length) return 0;

  let migrated = 0;
  for (const examKey of legacy) {
    const id = poolKeyId(examKey);
    if (!id) continue;
    const idxKey = poolIndexEntryKey(lang, level, id);
    const res = await store.setJSON(
      idxKey,
      { examKey, createdAt: Date.now(), migratedFrom: legacyKey },
      { onlyIfNew: true },
    );
    if (res?.modified !== false) migrated++;
  }
  if (migrated > 0) {
    console.info(`[pool-index] migrated ${migrated} legacy entries for ${lang}/${level}`);
  }
  return migrated;
}

async function rotatePoolByTimestamp(store, lang, level, entries) {
  if (entries.length <= MAX_PER_LEVEL) return 0;
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const remove = sorted.slice(0, entries.length - MAX_PER_LEVEL);
  let deleted = 0;
  for (const row of remove) {
    try {
      await store.delete(row.examKey);
      await store.delete(row.indexKey);
      deleted++;
    } catch (_) {
      /* ignore */
    }
  }
  if (deleted > 0) {
    console.info(`[pool-index] rotated ${deleted} oldest entries for ${lang}/${level}`);
  }
  return deleted;
}

/**
 * Publish exam to pool — per-item exam blob + append-only index entry.
 */
async function publishPoolExam(store, { lang, level, id, entry }) {
  const examKey = poolExamKey(lang, level, id);
  const idxKey = poolIndexEntryKey(lang, level, id);

  await store.setJSON(examKey, entry);

  const idxPayload = { examKey, createdAt: entry.createdAt || Date.now() };
  const idxRes = await store.setJSON(idxKey, idxPayload, { onlyIfNew: true });
  if (idxRes && idxRes.modified === false) {
    console.warn(`[pool-index] duplicate publish id=${id} lang=${lang} level=${level}`);
  }

  let entries = await listPoolIndexEntries(store, lang, level);
  if (!entries.length) {
    await migrateLegacyPoolIndex(store, lang, level);
    entries = await listPoolIndexEntries(store, lang, level);
  }
  await rotatePoolByTimestamp(store, lang, level, entries);

  return { examKey, idxKey };
}

function countExamItems(exam) {
  if (!exam || typeof exam !== 'object') return 0;
  let n = 0;
  const partsKeys = [
    'lesenParts', 'horenParts', 'schreibenParts', 'sprechenParts',
    'readingParts', 'listeningParts', 'writingParts', 'speakingParts',
  ];
  for (const pk of partsKeys) {
    for (const part of exam[pk] || []) {
      n += (part.questions || []).length;
      n += (part.items || []).length;
      n += (part.segments || []).length;
    }
  }
  return n;
}

async function listPoolExamsAdmin(store, lang, level) {
  await migrateLegacyPoolIndex(store, lang, level);
  const rows = await listPoolIndexEntries(store, lang, level);
  const out = [];
  for (const row of rows) {
    try {
      const entry = await store.get(row.examKey, { type: 'json' });
      if (!entry) continue;
      out.push({
        id: row.id,
        lang: entry.lang || lang,
        level: entry.level || level,
        topic: entry.topic || '',
        source: entry.source || 'ai',
        contributedBy: entry.contributedBy || null,
        createdAt: entry.createdAt || row.createdAt || 0,
        servedCount: entry.servedCount || 0,
        disabled: entry.disabled === true,
        itemCount: entry.itemCount ?? countExamItems(entry.exam),
      });
    } catch (_) {
      /* skip corrupt blob */
    }
  }
  return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function getPoolExamAdmin(store, lang, level, id) {
  const examKey = poolExamKey(lang, level, id);
  try {
    return await store.get(examKey, { type: 'json' });
  } catch (_) {
    return null;
  }
}

async function setPoolExamDisabled(store, lang, level, id, disabled) {
  const examKey = poolExamKey(lang, level, id);
  let entry;
  try {
    entry = await store.get(examKey, { type: 'json' });
  } catch (_) {
    return false;
  }
  if (!entry) return false;
  entry.disabled = !!disabled;
  await store.setJSON(examKey, entry);
  return true;
}

async function removePoolExam(store, lang, level, id) {
  const examKey = poolExamKey(lang, level, id);
  const idxKey = poolIndexEntryKey(lang, level, id);
  try {
    await store.delete(examKey);
    await store.delete(idxKey);
    return true;
  } catch (_) {
    return false;
  }
}

async function pickPoolExam(store, lang, level, exclude, { isValidEntry }) {
  let entries = await listPoolIndexEntries(store, lang, level);
  if (!entries.length) {
    await migrateLegacyPoolIndex(store, lang, level);
    entries = await listPoolIndexEntries(store, lang, level);
  }
  if (!entries.length) return null;

  const recent = entries.slice(-POOL_SAMPLE);
  const candidates = pickRandom(recent, Math.min(recent.length, POOL_SAMPLE)).filter(
    (row) => !exclude.has(row.id),
  );

  const fresh = [];
  for (const row of candidates) {
    try {
      const entry = await store.get(row.examKey, { type: 'json' });
      if (entry && isValidEntry(entry) && (entry.servedCount || 0) <= BURN_THRESHOLD) {
        fresh.push({ key: row.examKey, entry, id: row.id });
      }
    } catch (_) {
      /* skip */
    }
  }

  let pool = fresh;
  if (!pool.length) {
    for (const row of candidates) {
      try {
        const entry = await store.get(row.examKey, { type: 'json' });
        if (entry && isValidEntry(entry)) pool.push({ key: row.examKey, entry, id: row.id });
      } catch (_) {
        /* skip */
      }
    }
  }
  if (!pool.length) return null;

  const chosen = pool[Math.floor(Math.random() * pool.length)];

  try {
    return await casWriteJson(
      store,
      chosen.key,
      (current) => {
        const base = current || chosen.entry;
        const payload = {
          ...base,
          servedCount: (base.servedCount || 0) + 1,
          lastServedAt: Date.now(),
        };
        return {
          payload,
          result: { id: chosen.id, entry: payload, examKey: chosen.key },
        };
      },
      { logTag: '[pool-serve]' },
    );
  } catch (_) {
    const entry = {
      ...chosen.entry,
      servedCount: (chosen.entry.servedCount || 0) + 1,
      lastServedAt: Date.now(),
    };
    await store.setJSON(chosen.key, entry);
    return { id: chosen.id, entry, examKey: chosen.key };
  }
}

module.exports = {
  MAX_PER_LEVEL,
  POOL_SAMPLE,
  BURN_THRESHOLD,
  poolExamKey,
  poolIndexEntryKey,
  legacyPoolIndexKey,
  poolKeyId,
  pickRandom,
  listPoolIndexEntries,
  migrateLegacyPoolIndex,
  rotatePoolByTimestamp,
  publishPoolExam,
  pickPoolExam,
  countExamItems,
  listPoolExamsAdmin,
  getPoolExamAdmin,
  setPoolExamDisabled,
  removePoolExam,
};
