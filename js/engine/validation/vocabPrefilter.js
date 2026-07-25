/**
 * Pre-filter user vocabulary before generation — preference model, not imposition.
 * Words above B1 (or on the B1 blacklist) are marked/excluded from the prompt.
 */
const VocabPrefilter = (() => {
  const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  function getCefrLoader() {
    if (typeof CefrVocabLoader !== 'undefined') return CefrVocabLoader;
    try {
      return require('./CefrVocabLoader.js');
    } catch (_) {
      return null;
    }
  }

  function getLemmatizer() {
    if (typeof Lemmatizer !== 'undefined') return Lemmatizer;
    try {
      return require('./lemmatizer.js');
    } catch (_) {
      return null;
    }
  }

  function getBlacklist() {
    try {
      if (typeof window !== 'undefined' && window.__B1_LEXICAL_BLACKLIST__) {
        return window.__B1_LEXICAL_BLACKLIST__;
      }
      // Node: loaded by scripts/lib/vocabPrefilter.mjs
      if (typeof globalThis !== 'undefined' && globalThis.__B1_LEXICAL_BLACKLIST__) {
        return globalThis.__B1_LEXICAL_BLACKLIST__;
      }
    } catch (_) {
      /* optional */
    }
    return [];
  }

  function normLang(lang) {
    const l = String(lang || 'de').toLowerCase();
    if (l === 'de' || l.startsWith('de')) return 'de';
    if (l === 'es' || l.startsWith('es')) return 'es';
    return 'en';
  }

  function normToken(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/^der\s+|^die\s+|^das\s+|^el\s+|^la\s+|^los\s+|^las\s+/i, '');
  }

  function lemmaForms(word, lang) {
    const Lem = getLemmatizer();
    const core = normToken(word);
    if (!core) return [];
    const forms = new Set([core]);
    if (Lem?.normalizeLemma) {
      const lemma = Lem.normalizeLemma(core, lang);
      if (lemma) forms.add(String(lemma).toLowerCase());
    }
    if (Lem?.lemmaForms) {
      for (const f of Lem.lemmaForms(core, lang) || []) {
        if (f) forms.add(String(f).toLowerCase());
      }
    }
    return [...forms];
  }

  function matchesBlacklist(word, blacklist) {
    const raw = String(word || '').trim();
    if (!raw) return null;
    for (const entry of blacklist || []) {
      const re = entry?.term;
      if (re && re.test(raw)) {
        return entry.suggestion || 'Nicht empfohlen für B1';
      }
    }
    for (const form of lemmaForms(raw, 'de')) {
      for (const entry of blacklist || []) {
        const re = entry?.term;
        if (re && re.test(form)) {
          return entry.suggestion || 'Nicht empfohlen für B1';
        }
      }
    }
    return null;
  }

  function loadLevelSets(lang, targetLevel) {
    const Loader = getCefrLoader();
    if (!Loader) {
      return { b1: new Set(), b2Only: new Set(), aboveB2: new Set() };
    }
    const lg = normLang(lang);
    const target = String(targetLevel || 'B1').toUpperCase();
    const idx = LEVEL_ORDER.indexOf(target);
    const b1 = Loader.loadCumulativeVocabSync(lg, idx >= 0 ? target : 'B1');
    const b2 = Loader.loadCumulativeVocabSync(lg, 'B2');
    const c2 = Loader.loadCumulativeVocabSync(lg, 'C2');
    const b2Only = new Set();
    const aboveB2 = new Set();
    for (const w of b2) {
      if (!b1.has(w)) b2Only.add(w);
    }
    for (const w of c2) {
      if (!b2.has(w)) aboveB2.add(w);
    }
    return { b1, b2Only, aboveB2, b2, c2 };
  }

  function detectCefrBand(forms, sets) {
    for (const f of forms) {
      if (sets.b1.has(f)) return 'B1';
    }
    for (const f of forms) {
      if (sets.b2Only.has(f)) return 'B2';
    }
    for (const f of forms) {
      if (sets.aboveB2.has(f)) return 'C1';
    }
    return 'unknown';
  }

  /**
   * @param {string[]} words
   * @param {{ lang?: string, level?: string, blacklist?: object[] }} opts
   * @returns {{
   *   requested: string[],
   *   prompted: string[],
   *   excluded: { word: string, band: string, reason: string }[],
   *   warnings: { word: string, band: string, message: string }[],
   * }}
   */
  function classifyUserVocab(words, opts = {}) {
    const lang = normLang(opts.lang);
    const level = String(opts.level || 'B1').toUpperCase();
    const blacklist = opts.blacklist || getBlacklist();
    const sets = loadLevelSets(lang, level);
    const requested = (words || []).map((w) => String(w).trim()).filter(Boolean);
    const prompted = [];
    const excluded = [];
    const warnings = [];
    const seen = new Set();

    for (const raw of requested) {
      const key = normToken(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const bl = matchesBlacklist(raw, blacklist);
      if (bl) {
        excluded.push({
          word: raw,
          band: 'blacklist',
          reason: `Wort/Fachbegriff über B1 (${bl})`,
        });
        continue;
      }

      const forms = lemmaForms(raw, lang);
      const band = detectCefrBand(forms, sets);

      if (band === 'B2') {
        excluded.push({
          word: raw,
          band: 'B2',
          reason: 'Niveau B2 — passt oft nicht in einen B1-Text',
        });
        continue;
      }
      if (band === 'C1') {
        excluded.push({
          word: raw,
          band: 'C1',
          reason: 'Niveau C1 oder höher — nicht für B1-Generierung',
        });
        continue;
      }
      if (band === 'unknown') {
        warnings.push({
          word: raw,
          band: 'unknown',
          message: 'Nicht in der B1-Wortliste — der Generator kann sie weglassen, wenn sie nicht passt',
        });
      }

      prompted.push(raw);
    }

    return { requested, prompted, excluded, warnings };
  }

  return Object.freeze({ classifyUserVocab, normToken, lemmaForms, loadLevelSets });
})();

if (typeof window !== 'undefined') window.VocabPrefilter = VocabPrefilter;
if (typeof module !== 'undefined') module.exports = VocabPrefilter;
