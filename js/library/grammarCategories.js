/**
 * Closed grammar-error taxonomy for Schreiben/Sprechen AI eval → mastery profile.
 * Categories map to g-{lang}-{level}-{slug} tags (same namespace as objective items).
 */
const GrammarCategories = (() => {
  const CATEGORIES = Object.freeze([
    'passiv',
    'konjunktiv_ii',
    'wortstellung',
    'kasus',
    'artikel',
    'praeposition',
    'konnektor',
    'zeitform',
    'adjektivdeklination',
    'relativsatz',
    'trennbare_verben',
    'other',
  ]);

  const CATEGORY_TO_SLUG = Object.freeze({
    passiv: 'passiv',
    konjunktiv_ii: 'konjunktiv',
    wortstellung: 'wortstellung',
    kasus: 'kasus',
    artikel: 'artikel',
    praeposition: 'praeposition',
    konnektor: 'konnektor',
    zeitform: 'zeitform',
    adjektivdeklination: 'adjektivdeklination',
    relativsatz: 'relativ',
    trennbare_verben: 'trennbare-verben',
    other: 'other',
  });

  const PROMPT_LIST = CATEGORIES.join('|');

  function normalizeCategory(raw) {
    const s = String(raw || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');
    if (!s) return 'other';
    if (CATEGORIES.includes(s)) return s;
    if (s === 'konjunktiv' || s === 'konjunktiv2' || s === 'konjunktiv_2') return 'konjunktiv_ii';
    if (s === 'word_order' || s === 'satzbau') return 'wortstellung';
    if (s === 'case' || s === 'declension') return 'kasus';
    if (s === 'articles' || s === 'article') return 'artikel';
    if (s === 'preposition' || s === 'prep') return 'praeposition';
    if (s === 'connector' || s === 'nebensatz') return 'konnektor';
    if (s === 'tense' || s === 'perfekt' || s === 'futur') return 'zeitform';
    if (s === 'adjektiv' || s === 'adj_dekl') return 'adjektivdeklination';
    if (s === 'relativ' || s === 'relativpronomen') return 'relativsatz';
    if (s === 'separable' || s === 'trennbar') return 'trennbare_verben';
    if (s === 'passive') return 'passiv';
    return 'other';
  }

  function categoryToGrammarTag(category, lang = 'de', level = 'b1') {
    const cat = normalizeCategory(category);
    const slug = CATEGORY_TO_SLUG[cat] || 'other';
    const lg = String(lang || 'de').toLowerCase().slice(0, 2);
    const lv = String(level || 'b1').toLowerCase();
    return `g-${lg}-${lv}-${slug}`;
  }

  function promptInstruction() {
    return (
      `For every error with type "grammar", include "grammarCategory" using ONLY this closed taxonomy: ${PROMPT_LIST}. ` +
      'Also include top-level "grammarErrorSummary": [{"category":"...","count":N,"severity":"major|minor"}] aggregating grammar errors by category.'
    );
  }

  function normalizeSeverity(raw) {
    const s = String(raw || '').toLowerCase();
    return s === 'minor' ? 'minor' : 'major';
  }

  function deriveSummaryFromErrors(errors) {
    const counts = {};
    (errors || []).forEach((e) => {
      if (String(e?.type || '').toLowerCase() !== 'grammar') return;
      const cat = normalizeCategory(e.grammarCategory);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([category, count]) => ({
      category,
      count,
      severity: count >= 2 ? 'major' : 'minor',
    }));
  }

  function normalizeGrammarErrorSummary(raw, errors) {
    let rows = Array.isArray(raw) ? raw : [];
    if (!rows.length && Array.isArray(errors) && errors.length) {
      rows = deriveSummaryFromErrors(errors);
    }
    const out = [];
    rows.forEach((row) => {
      const category = normalizeCategory(row?.category);
      const count = Math.max(0, Math.round(Number(row?.count) || 0));
      if (!count) return;
      out.push({ category, count, severity: normalizeSeverity(row?.severity) });
    });
    return out;
  }

  function normalizeGrammarErrors(errors) {
    if (!Array.isArray(errors)) return [];
    return errors.slice(0, 8).map((e) => {
      const type = String(e?.type || 'grammar').toLowerCase();
      const base = {
        original: String(e?.original || '').trim(),
        correction: String(e?.correction || '').trim(),
        type,
        explanation: String(e?.explanation || '').trim(),
      };
      if (type === 'grammar') {
        base.grammarCategory = normalizeCategory(e?.grammarCategory);
      }
      return base;
    });
  }

  /** Merge production grammarErrorSummary into mastery grammarTags (errors = incorrect). */
  function mergeSummaryIntoTags(summary, grammarTags, { lang = 'de', level = 'b1' } = {}) {
    if (!grammarTags || typeof grammarTags !== 'object') return;
    (summary || []).forEach((row) => {
      const tag = categoryToGrammarTag(row.category, lang, level);
      const n = Math.max(0, Math.round(Number(row.count) || 0));
      if (!n) return;
      if (!grammarTags[tag]) grammarTags[tag] = { correct: 0, total: 0, streak: 0 };
      grammarTags[tag].total += n;
      grammarTags[tag].streak = 0;
    });
  }

  function collectProductionGrammar(entry, lang, level) {
    const delta = {};
    const ingest = (evals) => {
      (evals || []).forEach((ev) => {
        const summary = normalizeGrammarErrorSummary(ev?.grammarErrorSummary, ev?.errors);
        mergeSummaryIntoTags(summary, delta, { lang, level });
      });
    };
    ingest(entry?.writingEvals);
    ingest(entry?.speakingEvals);
    return delta;
  }

  return {
    CATEGORIES,
    PROMPT_LIST,
    normalizeCategory,
    categoryToGrammarTag,
    promptInstruction,
    normalizeSeverity,
    deriveSummaryFromErrors,
    normalizeGrammarErrorSummary,
    normalizeGrammarErrors,
    mergeSummaryIntoTags,
    collectProductionGrammar,
  };
})();

if (typeof window !== 'undefined') window.GrammarCategories = GrammarCategories;
if (typeof module !== 'undefined') module.exports = GrammarCategories;
