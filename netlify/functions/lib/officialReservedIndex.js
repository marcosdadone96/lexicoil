'use strict';

/**
 * Official exam part reservation index — partIds used in live published exams
 * must not be served for Textos (read-only pool-by-topic).
 *
 * Blob key: official_reserved_parts:{lang}:{level}
 * Local file: library/official-index/{lang}_{level}.json
 */
const fs = require('fs');
const path = require('path');
const { resolveFromRoot } = require('./projectRoot.js');

const INDEX_VERSION = 'v1';
const INDEX_CACHE = new Map();

function normLang(lang) {
  return String(lang).toLowerCase();
}

function normLevel(level) {
  return String(level).toUpperCase();
}

function indexCacheKey(lang, level) {
  return `${normLang(lang)}:${normLevel(level)}`;
}

function officialReservedIndexBlobKey(lang, level) {
  return `official_reserved_parts:${normLang(lang)}:${normLevel(level)}`;
}

function localOfficialIndexPath(lang, level, root) {
  const base = root || resolveFromRoot();
  return path.join(base, 'library', 'official-index', `${normLang(lang)}_${normLevel(level)}.json`);
}

function publishedExamsDir(lang, level, root) {
  const base = root || resolveFromRoot();
  return path.join(base, 'library', 'published-exams', normLang(lang), normLevel(level));
}

function loadLiveExamIdsFromCatalog(catalog) {
  return (catalog.exams || [])
    .filter((e) => String(e.status || 'live').toLowerCase() === 'live')
    .map((e) => e.examId)
    .filter(Boolean);
}

/**
 * Build reservation index from local published catalog + exam manifests.
 * Only exams with catalog status "live" are included.
 */
function buildOfficialReservedIndex({ lang = 'de', level = 'B1', root } = {}) {
  const normL = normLang(lang);
  const normLvl = normLevel(level);
  const base = root || resolveFromRoot();
  const catalogDir = publishedExamsDir(normL, normLvl, base);
  const catalogPath = path.join(catalogDir, '_catalog.json');

  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Catalog not found: ${catalogPath}`);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const liveExamIds = loadLiveExamIdsFromCatalog(catalog);
  const byPartId = {};
  const missingManifests = [];

  for (const examId of liveExamIds) {
    const examPath = path.join(catalogDir, `${examId}.json`);
    if (!fs.existsSync(examPath)) {
      missingManifests.push(examId);
      continue;
    }
    const exam = JSON.parse(fs.readFileSync(examPath, 'utf8'));
    for (const p of exam.parts || []) {
      const partId = p.partId;
      if (!partId) continue;
      const cell = p.cell || null;
      let entry = byPartId[partId];
      if (!entry) {
        entry = { exams: [], cells: [] };
        byPartId[partId] = entry;
      }
      if (!entry.exams.includes(examId)) entry.exams.push(examId);
      if (cell && !entry.cells.includes(cell)) entry.cells.push(cell);
    }
  }

  for (const entry of Object.values(byPartId)) {
    entry.exams.sort();
    entry.cells.sort();
  }

  const reservedPartIds = Object.keys(byPartId).sort();

  return {
    indexVersion: INDEX_VERSION,
    builtAt: new Date().toISOString(),
    lang: normL,
    level: normLvl,
    catalogVersion: catalog.version || null,
    liveExamCount: liveExamIds.length,
    reservedPartIds,
    byPartId,
    buildMeta: {
      missingManifests,
      catalogPath: path.relative(base, catalogPath),
    },
  };
}

function readAvailabilityExamCount(lang, level, root) {
  const availPath = path.join(root || resolveFromRoot(), 'data', 'exams', 'availability.json');
  if (!fs.existsSync(availPath)) return null;
  const avail = JSON.parse(fs.readFileSync(availPath, 'utf8'));
  return avail?.[normLang(lang)]?.[normLevel(level)]?.exams ?? null;
}

function stripBuildMeta(index) {
  const { buildMeta, ...rest } = index;
  return rest;
}

function writeOfficialReservedIndex(index, { lang, level, root } = {}) {
  const filePath = localOfficialIndexPath(lang || index.lang, level || index.level, root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(stripBuildMeta(index), null, 2)}\n`, 'utf8');
  clearOfficialReservedIndexCache(lang || index.lang, level || index.level);
  return filePath;
}

function loadOfficialReservedIndex({ lang = 'de', level = 'B1', root, refresh = false } = {}) {
  const key = indexCacheKey(lang, level);
  if (!refresh && INDEX_CACHE.has(key)) return INDEX_CACHE.get(key);

  const filePath = localOfficialIndexPath(lang, level, root);
  if (!fs.existsSync(filePath)) {
    INDEX_CACHE.set(key, null);
    return null;
  }

  try {
    const index = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    INDEX_CACHE.set(key, index);
    return index;
  } catch (_) {
    INDEX_CACHE.set(key, null);
    return null;
  }
}

function reservedPartIdSet(index) {
  if (!index) return new Set();
  if (Array.isArray(index.reservedPartIds)) return new Set(index.reservedPartIds);
  return new Set(Object.keys(index.byPartId || {}));
}

function applyOfficialReservedFlags(rows, index) {
  const set = reservedPartIdSet(index);
  const byPartId = index?.byPartId || {};
  for (const row of rows) {
    const meta = byPartId[row.id];
    row.officialReserved = set.has(row.id);
    row.officialExamIds = meta?.exams ? [...meta.exams] : [];
  }
  return rows;
}

function filterRowsForTextos(rows) {
  return rows.filter((r) => !r.officialReserved);
}

function clearOfficialReservedIndexCache(lang, level) {
  if (lang != null && level != null) {
    INDEX_CACHE.delete(indexCacheKey(lang, level));
    return;
  }
  INDEX_CACHE.clear();
}

function summarizeIndex(index) {
  if (!index) return null;
  const byModule = {};
  for (const partId of index.reservedPartIds || []) {
    const mod = String(partId).split('-')[0] || 'other';
    byModule[mod] = (byModule[mod] || 0) + 1;
  }
  return {
    liveExamCount: index.liveExamCount,
    reservedPartCount: (index.reservedPartIds || []).length,
    byModule,
    catalogVersion: index.catalogVersion,
    builtAt: index.builtAt,
  };
}

module.exports = {
  INDEX_VERSION,
  officialReservedIndexBlobKey,
  localOfficialIndexPath,
  buildOfficialReservedIndex,
  writeOfficialReservedIndex,
  loadOfficialReservedIndex,
  reservedPartIdSet,
  applyOfficialReservedFlags,
  filterRowsForTextos,
  clearOfficialReservedIndexCache,
  readAvailabilityExamCount,
  loadLiveExamIdsFromCatalog,
  summarizeIndex,
  stripBuildMeta,
};
