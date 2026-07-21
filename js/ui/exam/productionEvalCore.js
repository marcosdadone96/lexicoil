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

/**
 * Goethe B1 Schreiben module score: T1=40%, T2=40%, T3=20% (official format).
 * NOT used for Lesen/Hören/Sprechen — those keep equal / their own rules.
 * Missing Teile: renormalize weights among scored parts so partial exams still work.
 */
const GOETHE_SCHREIBEN_TEIL_WEIGHTS = Object.freeze({ 1: 0.4, 2: 0.4, 3: 0.2 });

function resolveSchreibenTeil(item, index) {
  const raw = item?.partMeta?.teil ?? item?.teil ?? item?.aufgabe ?? item?.id;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 3) return n;
  const idx = Number(index) + 1;
  return idx >= 1 && idx <= 3 ? idx : null;
}

function weightedSchreibenModuleScore(items) {
  const scored = (items || []).filter(
    (x) => x != null && x.score != null && Number.isFinite(Number(x.score)),
  );
  if (!scored.length) return null;
  let weightSum = 0;
  let acc = 0;
  scored.forEach((item, i) => {
    const teil = resolveSchreibenTeil(item, i);
    const w =
      teil != null && GOETHE_SCHREIBEN_TEIL_WEIGHTS[teil] != null
        ? GOETHE_SCHREIBEN_TEIL_WEIGHTS[teil]
        : 1 / scored.length;
    weightSum += w;
    acc += Number(item.score) * w;
  });
  if (weightSum <= 0) return averageScores(items);
  return Math.round(acc / weightSum);
}

function applyProductionEvalToModules(moduleResults, prodEval, passPercent, MG) {
  const out = { ...(moduleResults || {}) };
  if (!prodEval?.ok) return out;
  if (prodEval.schreiben?.length && MG) {
    // Schreiben only: Goethe 40/40/20 — do not use equal averageScores here.
    const avg = weightedSchreibenModuleScore(prodEval.schreiben);
    if (avg != null) {
      out.schreiben = MG.aiEvaluatedModuleResult(avg, passPercent, {
        ai: true,
        parts: prodEval.schreiben,
        schreibenWeights: GOETHE_SCHREIBEN_TEIL_WEIGHTS,
      });
    }
  }
  if (prodEval.sprechen?.length && MG) {
    // Sprechen unchanged: equal average of part scores.
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
  weightedSchreibenModuleScore,
  GOETHE_SCHREIBEN_TEIL_WEIGHTS,
  CACHE_KEY,
};

if (typeof module !== 'undefined') module.exports = productionEvalCoreExports;
if (typeof window !== 'undefined') window.ProductionEvalCore = productionEvalCoreExports;
