/**
 * Canonical library catalog — advertised vs servable question-bank availability (Phase 1).
 */
const LibraryCatalog = (() => {
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const LANGS = ['de', 'en', 'es'];

  /** Levels with library/{lang}/{level}/questions.json on disk (all 18). */
  const LIBRARY = Object.freeze({
    de: [...LEVELS],
    en: [...LEVELS],
    es: [...LEVELS],
  });

  const EXAM_TYPE = Object.freeze({ de: 'goethe', en: 'cambridge', es: 'dele' });

  function blueprintId(lang, level) {
    const type = EXAM_TYPE[lang];
    return type && level ? `${type}_${level}` : null;
  }

  function hasLibrary(lang, level) {
    if (typeof LibraryLoader !== 'undefined') {
      return LibraryLoader.hasLibrary(lang, level);
    }
    return false;
  }

  function libraryLevels(lang) {
    return LIBRARY[lang] ? [...LIBRARY[lang]] : [];
  }

  function advertisedLevels(lang) {
    if (typeof LibraryLoader !== 'undefined' && LibraryLoader.advertisedLevels) {
      return LibraryLoader.advertisedLevels(lang);
    }
    return [...LEVELS];
  }

  /** Levels shown in UI — only those that pass catalogThresholds + blueprint requirements. */
  function selectableLevels(lang) {
    if (typeof LibraryLoader !== 'undefined') {
      return LibraryLoader.supportedLevels(lang);
    }
    return [];
  }

  function isLevelAvailable(lang, level) {
    return hasLibrary(lang, level);
  }

  function buildBlueprintIndex() {
    const idx = {};
    for (const lang of LANGS) {
      for (const level of LEVELS) {
        idx[`${lang}_${level}`] = blueprintId(lang, level);
      }
    }
    return idx;
  }

  return {
    LEVELS,
    LANGS,
    LIBRARY,
    EXAM_TYPE,
    blueprintId,
    hasLibrary,
    libraryLevels,
    advertisedLevels,
    selectableLevels,
    isLevelAvailable,
    buildBlueprintIndex,
  };
})();

if (typeof window !== 'undefined') window.LibraryCatalog = LibraryCatalog;
if (typeof module !== 'undefined') module.exports = LibraryCatalog;
