/**
 * Production eval client core — hash, cache, apply scores to moduleResults (browser + Node).
 */
const CACHE_KEY = 'lc_prod_eval_cache';
const CACHE_MAX = 24;

function stableStringify(obj) {
  if (obj == null) return 'null';
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  if (typeof obj === 'object') {
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(obj);
}

function hashProductionSubmission(payload) {
  const s = stableStringify(payload);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `pe_${h.toString(16)}`;
}

function readCacheStore() {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }
  if (typeof globalThis !== 'undefined' && globalThis.__lcProdEvalCache) {
    return globalThis.__lcProdEvalCache;
  }
  return {};
}

function writeCacheStore(store) {
  const keys = Object.keys(store);
  while (keys.length > CACHE_MAX) {
    delete store[keys.shift()];
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(store));
    } catch (_) {
      /* quota */
    }
  } else if (typeof globalThis !== 'undefined') {
    globalThis.__lcProdEvalCache = store;
  }
}

function readProductionEvalCache(cacheKey) {
  const store = readCacheStore();
  return store[cacheKey] || null;
}

function writeProductionEvalCache(cacheKey, result) {
  const store = readCacheStore();
  store[cacheKey] = { ...result, cachedAt: Date.now() };
  writeCacheStore(store);
}

function averageScores(items) {
  const scores = (items || []).map((x) => x.score).filter((v) => v != null && Number.isFinite(v));
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function applyProductionEvalToModules(moduleResults, prodEval, passPercent, MG) {
  const out = { ...(moduleResults || {}) };
  if (!prodEval?.ok) return out;
  if (prodEval.schreiben?.length && MG) {
    const avg = averageScores(prodEval.schreiben);
    if (avg != null) {
      out.schreiben = MG.aiEvaluatedModuleResult(avg, passPercent, {
        ai: true,
        parts: prodEval.schreiben,
      });
    }
  }
  if (prodEval.sprechen?.length && MG) {
    const avg = averageScores(prodEval.sprechen);
    if (avg != null) {
      out.sprechen = MG.aiEvaluatedModuleResult(avg, passPercent, {
        ai: true,
        parts: prodEval.sprechen,
      });
    }
  }
  return out;
}

function applyOrientativeFallback(moduleResults, { schreibenHints = [], sprechenHints = [], isDE = false }, MG) {
  const out = { ...(moduleResults || {}) };
  if (schreibenHints.length && MG) {
    const hint = schreibenHints.map((h) => h.hint || h.note).filter(Boolean).join(' · ');
    out.schreiben = MG.unevaluatedOrientativeResult(hint, isDE);
    out.schreiben.lengthHints = schreibenHints;
  }
  if (sprechenHints.length && MG) {
    const hint = sprechenHints.map((h) => h.hint || h.note).filter(Boolean).join(' · ');
    out.sprechen = MG.unevaluatedOrientativeResult(hint, isDE);
  }
  return out;
}

const productionEvalCoreExports = {
  hashProductionSubmission,
  readProductionEvalCache,
  writeProductionEvalCache,
  applyProductionEvalToModules,
  applyOrientativeFallback,
  averageScores,
  CACHE_KEY,
};

if (typeof module !== 'undefined') module.exports = productionEvalCoreExports;
if (typeof window !== 'undefined') window.ProductionEvalCore = productionEvalCoreExports;
