/**
 * Servability assessment — catalogThresholds + blueprint-required modules (Phase 1).
 * Shared by LibraryLoader (browser) and validate-content-schema.mjs (Node).
 */
const ContentServable = (() => {
  const MODULE_ITEM_KEYS = {
    lesen: ['lesen', 'reading'],
    horen: ['horen', 'listening'],
    grammatik: ['grammatik', 'grammar'],
    use_of_english: ['use_of_english'],
  };

  const PASSAGE_MODULE_KEYS = {
    lesen: ['lesen', 'reading'],
    horen: ['horen', 'listening'],
  };

  const DEFAULT_THRESHOLDS = {
    minItemsServable: { lesen: 24, horen: 16, grammatik: 20, use_of_english: 24 },
    minPassagesServable: { lesen: 6, horen: 4 },
    minWritingPrompts: 4,
    minSpeakingPrompts: 4,
  };

  let thresholdsCache = null;

  function mergeThresholds(raw) {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_THRESHOLDS };
    return {
      minItemsServable: { ...DEFAULT_THRESHOLDS.minItemsServable, ...(raw.minItemsServable || {}) },
      minPassagesServable: { ...DEFAULT_THRESHOLDS.minPassagesServable, ...(raw.minPassagesServable || {}) },
      minWritingPrompts: raw.minWritingPrompts ?? DEFAULT_THRESHOLDS.minWritingPrompts,
      minSpeakingPrompts: raw.minSpeakingPrompts ?? DEFAULT_THRESHOLDS.minSpeakingPrompts,
    };
  }

  function setThresholds(raw) {
    thresholdsCache = mergeThresholds(raw);
    return thresholdsCache;
  }

  function getThresholds() {
    return thresholdsCache || { ...DEFAULT_THRESHOLDS };
  }

  function normalizeModuleId(id) {
    const m = String(id || '').toLowerCase();
    if (m === 'reading') return 'lesen';
    if (m === 'listening') return 'horen';
    if (m === 'grammar') return 'grammatik';
    if (m === 'writing') return 'schreiben';
    if (m === 'speaking') return 'sprechen';
    return m;
  }

  function countQuestionsByModule(questions) {
    const counts = { lesen: 0, horen: 0, grammatik: 0, use_of_english: 0, schreiben: 0, sprechen: 0 };
    (questions || []).forEach((q) => {
      const mod = normalizeModuleId(q.module);
      if (counts[mod] != null) counts[mod]++;
      else counts[mod] = 1;
    });
    return counts;
  }

  function mergePassages(embedded, external) {
    const byId = new Map();
    [...(embedded || []), ...(external || [])].forEach((p) => {
      if (p?.id) byId.set(p.id, p);
    });
    return [...byId.values()];
  }

  function countPassagesByModule(passages) {
    const counts = { lesen: 0, horen: 0 };
    (passages || []).forEach((p) => {
      const mod = normalizeModuleId(p.module);
      if (mod === 'lesen' || mod === 'horen') counts[mod]++;
    });
    return counts;
  }

  function blueprintModuleIds(blueprint) {
    return (blueprint?.modules || []).map((m) => normalizeModuleId(m.id)).filter(Boolean);
  }

  function itemCountForModule(counts, moduleId) {
    const mod = normalizeModuleId(moduleId);
    if (mod === 'lesen' || mod === 'horen' || mod === 'grammatik' || mod === 'use_of_english') {
      return counts[mod] || 0;
    }
    return 0;
  }

  function partCount(blueprint, moduleId) {
    const mod = blueprint?.modules?.find((m) => normalizeModuleId(m.id) === moduleId);
    return mod?.parts?.length || 0;
  }

  function requiredWritingPrompts(blueprint, th) {
    const fromBp = partCount(blueprint, 'schreiben');
    return fromBp > 0 ? fromBp : th.minWritingPrompts;
  }

  function requiredSpeakingPrompts(blueprint, th) {
    const mods = blueprint ? blueprintModuleIds(blueprint) : [];
    if (!mods.includes('sprechen')) return 0;
    const fromBp = partCount(blueprint, 'sprechen');
    return fromBp > 0 ? fromBp : th.minSpeakingPrompts;
  }

  function assessLevel({ lang, level, questions, passages, writingSpeaking, blueprint, thresholds }) {
    const th = mergeThresholds(thresholds || getThresholds());
    const qCounts = countQuestionsByModule(questions);
    const pCounts = countPassagesByModule(passages);
    const writingCount = (writingSpeaking?.writing || []).length;
    const speakingCount = (writingSpeaking?.speaking || []).length;
    const requiredModules = blueprint ? blueprintModuleIds(blueprint) : ['lesen', 'horen'];
    const deficits = [];

    requiredModules.forEach((mod) => {
      if (mod === 'lesen' || mod === 'horen') {
        const itemMin = th.minItemsServable[mod];
        const itemActual = itemCountForModule(qCounts, mod);
        if (itemMin != null && itemActual < itemMin) {
          deficits.push({
            kind: 'items',
            module: mod,
            required: itemMin,
            actual: itemActual,
            message: `${mod} items: ${itemActual}/${itemMin}`,
          });
        }
        const passMin = th.minPassagesServable[mod];
        const passActual = pCounts[mod] || 0;
        if (passMin != null && passActual < passMin) {
          deficits.push({
            kind: 'passages',
            module: mod,
            required: passMin,
            actual: passActual,
            message: `${mod} passages: ${passActual}/${passMin}`,
          });
        }
      } else if (mod === 'grammatik' || mod === 'use_of_english') {
        const itemMin = th.minItemsServable[mod];
        const itemActual = itemCountForModule(qCounts, mod);
        if (itemMin != null && itemActual < itemMin) {
          deficits.push({
            kind: 'items',
            module: mod,
            required: itemMin,
            actual: itemActual,
            message: `${mod} items: ${itemActual}/${itemMin}`,
          });
        }
      } else if (mod === 'schreiben') {
        const req = requiredWritingPrompts(blueprint, th);
        if (writingCount < req) {
          deficits.push({
            kind: 'writing',
            module: mod,
            required: req,
            actual: writingCount,
            message: `writing prompts: ${writingCount}/${req}`,
          });
        }
      } else if (mod === 'sprechen') {
        const req = requiredSpeakingPrompts(blueprint, th);
        if (speakingCount < req) {
          deficits.push({
            kind: 'speaking',
            module: mod,
            required: req,
            actual: speakingCount,
            message: `speaking prompts: ${speakingCount}/${req}`,
          });
        }
      }
    });

    return {
      lang,
      level,
      servable: deficits.length === 0,
      deficits,
      counts: { questions: qCounts, passages: pCounts, writing: writingCount, speaking: speakingCount },
      requiredModules,
    };
  }

  function thresholdsPath() {
    return 'library/catalogThresholds.json';
  }

  async function loadThresholdsAsync(fetchFn) {
    if (thresholdsCache) return thresholdsCache;
    const fetch = fetchFn || (typeof globalThis !== 'undefined' && globalThis.fetch);
    if (!fetch) return setThresholds(null);
    try {
      const res = await fetch(thresholdsPath(), { cache: 'no-store' });
      if (res.ok) return setThresholds(await res.json());
    } catch (_) {
      /* fallback defaults */
    }
    return setThresholds(null);
  }

  function loadThresholdsSync(readFileSync, root) {
    if (thresholdsCache) return thresholdsCache;
    try {
      const fs = readFileSync ? { readFileSync } : require('fs');
      const pathMod = require('path');
      const file = root
        ? pathMod.join(root, 'library', 'catalogThresholds.json')
        : pathMod.join(__dirname, '..', '..', 'library', 'catalogThresholds.json');
      return setThresholds(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (_) {
      return setThresholds(null);
    }
  }

  return {
    DEFAULT_THRESHOLDS,
    MODULE_ITEM_KEYS,
    mergeThresholds,
    setThresholds,
    getThresholds,
    normalizeModuleId,
    countQuestionsByModule,
    mergePassages,
    countPassagesByModule,
    blueprintModuleIds,
    requiredWritingPrompts,
    requiredSpeakingPrompts,
    partCount,
    assessLevel,
    loadThresholdsAsync,
    loadThresholdsSync,
    thresholdsPath,
  };
})();

if (typeof window !== 'undefined') window.ContentServable = ContentServable;
if (typeof module !== 'undefined') module.exports = ContentServable;
