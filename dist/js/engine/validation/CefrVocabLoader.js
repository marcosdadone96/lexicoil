/**
 * CEFR vocabulary loader — library/vocab/{lang}/{LEVEL}.json (Phase 3).
 * Does not duplicate knowledge/cefr/{LEVEL}.json descriptors or language grammar lists.
 */
const CefrVocabLoader = (() => {
  const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const cache = new Map();

  let nodeRoot = null;
  try {
    if (typeof __dirname !== 'undefined') {
      const path = require('path');
      const fs = require('fs');
      const candidates = [
        path.join(process.cwd(), 'library', 'vocab'),
        path.join(__dirname, '..', '..', '..', 'library', 'vocab'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          nodeRoot = c;
          break;
        }
      }
      if (!nodeRoot) nodeRoot = candidates[0];
    }
  } catch (_) {
    /* browser */
  }

  function normLang(lang) {
    const l = String(lang || 'en').toLowerCase();
    if (l === 'de' || l.startsWith('de')) return 'de';
    if (l === 'es' || l.startsWith('es')) return 'es';
    return 'en';
  }

  function normLevel(level) {
    const u = String(level || '').toUpperCase();
    return LEVEL_ORDER.includes(u) ? u : null;
  }

  async function loadLevelVocab(lang, level) {
    const lg = normLang(lang);
    const lv = normLevel(level);
    if (!lv) return { level: lv, lang: lg, lemmas: [] };
    const key = `${lg}/${lv}`;
    if (cache.has(key)) return cache.get(key);

    let data;
    const rel = `vocab/${lg}/${lv}.json`;
    if (nodeRoot) {
      const fs = require('fs');
      const path = require('path');
      const full = path.join(nodeRoot, `${lg}${path.sep}${lv}.json`);
      if (!fs.existsSync(full)) {
        data = { level: lv, lang: lg, lemmas: [] };
      } else {
        data = JSON.parse(fs.readFileSync(full, 'utf8'));
      }
    } else {
      const res = await fetch(`/library/${rel}`, { cache: 'no-store' });
      if (!res.ok) data = { level: lv, lang: lg, lemmas: [] };
      else data = await res.json();
    }

    const out = {
      level: lv,
      lang: lg,
      lemmas: [...new Set((data.lemmas || []).map((w) => String(w).toLowerCase()))],
      lemmaCount: (data.lemmas || []).length,
      source: data.source || 'unknown',
    };
    cache.set(key, out);
    return out;
  }

  function loadLevelVocabSync(lang, level) {
    const lg = normLang(lang);
    const lv = normLevel(level);
    if (!lv || !nodeRoot) return { level: lv, lang: lg, lemmas: [] };
    const key = `${lg}/${lv}`;
    if (cache.has(key)) return cache.get(key);

    const fs = require('fs');
    const path = require('path');
    const full = path.join(nodeRoot, `${lg}${path.sep}${lv}.json`);
    let data = { lemmas: [] };
    if (fs.existsSync(full)) data = JSON.parse(fs.readFileSync(full, 'utf8'));
    const out = {
      level: lv,
      lang: lg,
      lemmas: [...new Set((data.lemmas || []).map((w) => String(w).toLowerCase()))],
      lemmaCount: (data.lemmas || []).length,
      source: data.source || 'unknown',
    };
    cache.set(key, out);
    return out;
  }

  async function loadCumulativeVocab(lang, upToLevel) {
    const lg = normLang(lang);
    const target = normLevel(upToLevel);
    const idx = LEVEL_ORDER.indexOf(target);
    if (idx < 0) return new Set();
    const set = new Set();
    for (let i = 0; i <= idx; i++) {
      const row = await loadLevelVocab(lg, LEVEL_ORDER[i]);
      row.lemmas.forEach((w) => set.add(w));
    }
    return set;
  }

  function loadCumulativeVocabSync(lang, upToLevel) {
    const lg = normLang(lang);
    const target = normLevel(upToLevel);
    const idx = LEVEL_ORDER.indexOf(target);
    if (idx < 0) return new Set();
    const set = new Set();
    for (let i = 0; i <= idx; i++) {
      const row = loadLevelVocabSync(lg, LEVEL_ORDER[i]);
      row.lemmas.forEach((w) => set.add(w));
    }
    return set;
  }

  function clearCache() {
    cache.clear();
  }

  return Object.freeze({
    LEVEL_ORDER,
    loadLevelVocab,
    loadLevelVocabSync,
    loadCumulativeVocab,
    loadCumulativeVocabSync,
    clearCache,
  });
})();

if (typeof window !== 'undefined') window.CefrVocabLoader = CefrVocabLoader;
if (typeof module !== 'undefined') module.exports = CefrVocabLoader;
