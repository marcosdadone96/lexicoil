'use strict';

/**
 * Offline reusable-parts fallback — serves from library/reusable-seed/*.json
 * when Netlify Blobs store is empty or unreachable (local dev, pre-seed).
 */
const fs = require('fs');
const path = require('path');
const { resolveFromRoot } = require('./projectRoot.js');

const CACHE = new Map();

function resolveSeedDir() {
  const candidates = [
    resolveFromRoot('library', 'reusable-seed'),
    path.join(__dirname, '..', '..', '..', 'library', 'reusable-seed'),
    path.join(__dirname, '..', '..', 'library', 'reusable-seed'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function seedFileTag(lang, level) {
  return `${String(lang).toLowerCase()}_${String(level).toUpperCase()}`;
}

function loadSeedRecords(lang, level) {
  const key = seedFileTag(lang, level);
  if (CACHE.has(key)) return CACHE.get(key);

  const dir = resolveSeedDir();
  const records = [];
  if (dir) {
    for (const suffix of ['.json', '.bank.json']) {
      const file = path.join(dir, `${key}${suffix}`);
      if (!fs.existsSync(file)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(data.records)) records.push(...data.records);
      } catch (_) {
        /* skip corrupt seed file */
      }
    }
  }
  CACHE.set(key, records);
  return records;
}

function clearLocalSeedCache() {
  CACHE.clear();
}

function pickFromLocalSeed(lang, level, module, {
  excludeIds = [], teil = null, words = [], excludeTopics = [],
} = {}) {
  const normLang = String(lang).toLowerCase();
  const normLevel = String(level).toUpperCase();
  const normModule = String(module).toLowerCase();
  const exclude = new Set(excludeIds || []);

  let available = loadSeedRecords(normLang, normLevel).filter((r) => {
    if (String(r.lang || '').toLowerCase() !== normLang) return false;
    if (String(r.level || '').toUpperCase() !== normLevel) return false;
    if (String(r.module || '').toLowerCase() !== normModule) return false;
    if (r.disabled === true) return false;
    if (r.complete !== true || r.verified !== true) return false;
    if (exclude.has(r.id)) return false;
    return true;
  });

  if (teil != null && Number.isFinite(Number(teil))) {
    const want = Number(teil);
    available = available.filter((r) => Number(r.teil) === want);
  }
  if (!available.length) return null;

  const wantLemmas = (words || []).map((w) => String(w).toLowerCase()).filter(Boolean);
  if (wantLemmas.length) {
    const wantSet = new Set(wantLemmas);
    const topicsToAvoid = new Set((excludeTopics || []).map((t) => String(t).toLowerCase()));
    const scored = available.map((rec) => {
      const vocab = Array.isArray(rec.vocab) ? rec.vocab : [];
      const covered = vocab.filter((v) => wantSet.has(String(v).toLowerCase()));
      return {
        id: rec.id,
        part: rec,
        covered,
        score: covered.length,
        topicPenalty: topicsToAvoid.has(String(rec.topic || '').toLowerCase()) ? 1 : 0,
        served: rec.servedCount || 0,
      };
    });
    scored.sort((a, b) =>
      b.score - a.score ||
      a.topicPenalty - b.topicPenalty ||
      a.served - b.served ||
      Math.random() - 0.5,
    );
    const chosen = scored[0];
    return {
      id: chosen.id,
      part: chosen.part,
      coveredWords: chosen.covered,
      coverage: { covered: chosen.covered.length, requested: wantSet.size },
      topic: chosen.part.topic || null,
      source: 'local-seed',
    };
  }

  const chosen = available[Math.floor(Math.random() * available.length)];
  return { id: chosen.id, part: chosen, source: 'local-seed' };
}

function countLocalSeedByTeil(lang, level, module) {
  const normLang = String(lang).toLowerCase();
  const normLevel = String(level).toUpperCase();
  const normModule = String(module).toLowerCase();
  const counts = {};
  for (const r of loadSeedRecords(normLang, normLevel)) {
    if (String(r.module || '').toLowerCase() !== normModule) continue;
    if (r.complete !== true || r.verified !== true || r.disabled === true) continue;
    const t = Number(r.teil);
    if (!Number.isFinite(t)) continue;
    counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

module.exports = {
  loadSeedRecords,
  pickFromLocalSeed,
  countLocalSeedByTeil,
  clearLocalSeedCache,
};
