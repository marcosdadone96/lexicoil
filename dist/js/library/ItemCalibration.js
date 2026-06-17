/**
 * Item-level empirical calibration (Sprint 5) — p-values per bank itemId.
 * Shared by calibrate-from-usage.mjs (Node) and ExamBlueprint (browser).
 */
const ItemCalibration = (() => {
  const CACHE = {};

  /** Goethe B1 target proportion-correct by module/teil (official-ish spread). */
  const DEFAULT_TARGET_P = {
    lesen: { 1: 0.72, 2: 0.62, 3: 0.58, 4: 0.54, 5: 0.6 },
    horen: { 1: 0.68, 2: 0.6, 3: 0.55, 4: 0.52 },
  };

  function normalizeItemId(id) {
    if (!id) return null;
    return String(id).replace(/^ql_/, '');
  }

  function difficultyToPriorP(difficulty) {
    const d = Number(difficulty);
    if (!Number.isFinite(d)) return 0.6;
    return Math.max(0.35, Math.min(0.85, 0.85 - (d - 1) * 0.1));
  }

  function pToDifficulty(p) {
    const v = Number(p);
    if (!Number.isFinite(v)) return 4;
    return Math.max(1, Math.min(5, Math.round(5 - v * 4)));
  }

  function confidenceBand(total) {
    const n = Number(total) || 0;
    if (n >= 20) return 'high';
    if (n >= 8) return 'medium';
    if (n >= 3) return 'low';
    return 'none';
  }

  function computePValue(correct, total) {
    const t = Number(total) || 0;
    if (t <= 0) return null;
    return Math.round((Number(correct) / t) * 1000) / 1000;
  }

  function targetP(calibration, module, teil) {
    const mod = String(module || '').toLowerCase();
    const t = Number(teil);
    const fromFile = calibration?.targets?.[mod]?.[String(t)] ?? calibration?.targets?.[mod]?.[t];
    if (fromFile != null) return fromFile;
    return DEFAULT_TARGET_P[mod]?.[t] ?? 0.6;
  }

  function itemRecord(calibration, itemId) {
    const id = normalizeItemId(itemId);
    return id ? calibration?.items?.[id] || null : null;
  }

  function effectiveP(q, calibration) {
    const rec = itemRecord(calibration, q.id);
    if (rec?.pValue != null) return rec.pValue;
    return difficultyToPriorP(q.difficulty);
  }

  function scoreCandidate(q, targetPValue, calibration) {
    const rec = itemRecord(calibration, q.id);
    const p = effectiveP(q, calibration);
    const gap = Math.abs(p - targetPValue);
    const uncertainty = rec ? (rec.confidence === 'high' ? 0 : rec.confidence === 'medium' ? 0.04 : 0.08) : 0.12;
    return gap + uncertainty;
  }

  function pickCalibrated(candidates, count, { module, teil, calibration, shuffleFn }) {
    const shuf = shuffleFn || ((arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });
    if (!candidates.length || count <= 0) return [];
    const tp = targetP(calibration, module, teil);
    const ranked = candidates
      .map((q) => ({ q, score: scoreCandidate(q, tp, calibration) }))
      .sort((a, b) => a.score - b.score || String(a.q.id).localeCompare(String(b.q.id)));
    const windowSize = Math.min(ranked.length, Math.max(count * 2, count + 2));
    const window = shuf(ranked.slice(0, windowSize));
    return window.slice(0, count).map((r) => r.q);
  }

  function buildItemEntry({ itemId, correct, total, module, teil, lang, level }) {
    const pValue = computePValue(correct, total);
    return {
      itemId: normalizeItemId(itemId),
      module: module || null,
      teil: teil ?? null,
      lang: lang || null,
      level: level || null,
      attempts: total,
      correct,
      pValue,
      confidence: confidenceBand(total),
      calibratedDifficulty: pValue != null ? pToDifficulty(pValue) : null,
      updatedAt: new Date().toISOString(),
    };
  }

  function mergeUsageIntoCalibration(calibration, usageItems, { lang, level }) {
    const out = {
      meta: {
        ...(calibration?.meta || {}),
        lang: lang || calibration?.meta?.lang,
        level: level || calibration?.meta?.level,
        version: (calibration?.meta?.version || 0) + 1,
        generatedAt: new Date().toISOString().slice(0, 10),
        source: 'calibrate-from-usage',
      },
      targets: calibration?.targets || { ...DEFAULT_TARGET_P },
      items: { ...(calibration?.items || {}) },
    };

    for (const [rawId, stat] of Object.entries(usageItems || {})) {
      const id = normalizeItemId(rawId);
      if (!id) continue;
      const correct = Number(stat.correct) || 0;
      const total = Number(stat.total) || 0;
      if (total <= 0) continue;
      const prev = out.items[id];
      const mergedCorrect = (prev?.correct || 0) + correct;
      const mergedTotal = (prev?.attempts || 0) + total;
      out.items[id] = buildItemEntry({
        itemId: id,
        correct: mergedCorrect,
        total: mergedTotal,
        module: stat.module || prev?.module,
        teil: stat.teil ?? prev?.teil,
        lang: out.meta.lang,
        level: out.meta.level,
      });
    }
    return out;
  }

  function seedPriorsFromBank(bank, { lang, level }) {
    const items = {};
    for (const q of bank.questions || []) {
      const p = difficultyToPriorP(q.difficulty);
      items[q.id] = buildItemEntry({
        itemId: q.id,
        correct: Math.round(p * 10),
        total: 10,
        module: q.module,
        teil: q.teil,
        lang,
        level,
      });
      items[q.id].source = 'prior';
    }
    return {
      meta: {
        lang,
        level,
        version: 1,
        generatedAt: new Date().toISOString().slice(0, 10),
        source: 'seed-priors',
      },
      targets: { ...DEFAULT_TARGET_P },
      items,
    };
  }

  function calibrationPath(lang, level) {
    return `library/${lang}/${level}/calibration.json`;
  }

  async function loadAsync(lang, level, fetchFn) {
    const key = `${lang}_${level}`;
    if (CACHE[key]) return CACHE[key];
    const fetch = fetchFn || (typeof globalThis !== 'undefined' && globalThis.fetch);
    if (!fetch) return null;
    try {
      const res = await fetch(calibrationPath(lang, level), { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      CACHE[key] = data;
      return data;
    } catch (_) {
      return null;
    }
  }

  function loadSync(readFileSync, root, lang, level) {
    const key = `${lang}_${level}`;
    if (CACHE[key]) return CACHE[key];
    try {
      const fsMod = require('fs');
      const pathMod = require('path');
      const read = readFileSync || fsMod.readFileSync.bind(fsMod);
      const file = root
        ? pathMod.join(root, 'library', lang, level, 'calibration.json')
        : pathMod.join(__dirname, '..', '..', 'library', lang, level, 'calibration.json');
      if (!fsMod.existsSync(file)) return null;
      const data = JSON.parse(read(file, 'utf8'));
      CACHE[key] = data;
      return data;
    } catch (_) {
      return null;
    }
  }

  function clearCache() {
    Object.keys(CACHE).forEach((k) => delete CACHE[k]);
  }

  return {
    DEFAULT_TARGET_P,
    normalizeItemId,
    difficultyToPriorP,
    pToDifficulty,
    confidenceBand,
    computePValue,
    targetP,
    itemRecord,
    effectiveP,
    scoreCandidate,
    pickCalibrated,
    buildItemEntry,
    mergeUsageIntoCalibration,
    seedPriorsFromBank,
    calibrationPath,
    loadAsync,
    loadSync,
    clearCache,
  };
})();

if (typeof window !== 'undefined') window.ItemCalibration = ItemCalibration;
if (typeof module !== 'undefined') module.exports = ItemCalibration;
