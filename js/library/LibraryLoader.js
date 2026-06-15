/* Question library loader — /library/{lang}/{level}/questions.json */
const LibraryLoader = (() => {
  const ADVERTISED = (() => {
    if (typeof LibraryCatalog !== 'undefined') {
      return { ...LibraryCatalog.LIBRARY };
    }
    return {
      de: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      en: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      es: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    };
  })();
  const CACHE = {};
  const AVAIL = {};
  const REPORT = {};

  function cacheKey(lang, level) {
    return `${lang}_${level}`;
  }

  function filePath(lang, level) {
    return `library/${lang}/${level}/questions.json`;
  }

  function passagesPath(lang, level) {
    return `library/${lang}/${level}/passages.json`;
  }

  function writingSpeakingPath(lang, level) {
    return `library/${lang}/${level}/writing-speaking.json`;
  }

  function blueprintPath(lang, level) {
    if (typeof LibraryCatalog !== 'undefined') {
      const id = LibraryCatalog.blueprintId(lang, level);
      return id ? `library/blueprints/${id}.json` : null;
    }
    const type = lang === 'de' ? 'goethe' : lang === 'es' ? 'dele' : 'cambridge';
    return `library/blueprints/${type}_${level}.json`;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  }

  function assessFromData(lang, level, questionsBank, passagesFile, wsFile, blueprint) {
    if (typeof ContentServable === 'undefined') {
      return { servable: !!(questionsBank?.questions?.length), deficits: [] };
    }
    const passages = ContentServable.mergePassages(questionsBank?.passages, passagesFile?.passages);
    return ContentServable.assessLevel({
      lang,
      level,
      questions: questionsBank?.questions || [],
      passages,
      writingSpeaking: wsFile || { writing: [], speaking: [] },
      blueprint,
    });
  }

  function hasLibrary(lang, level) {
    const key = cacheKey(lang, level);
    return AVAIL[key] === true;
  }

  function getServabilityReport(lang, level) {
    return REPORT[cacheKey(lang, level)] || null;
  }

  function supportedLevels(lang) {
    if (!ADVERTISED[lang]) return [];
    return ADVERTISED[lang].filter((level) => hasLibrary(lang, level));
  }

  function advertisedLevels(lang) {
    return ADVERTISED[lang] ? [...ADVERTISED[lang]] : [];
  }

  async function probeLevel(lang, level) {
    const key = cacheKey(lang, level);
    if (AVAIL[key] !== undefined) return AVAIL[key];

    try {
      if (typeof ContentServable !== 'undefined') {
        await ContentServable.loadThresholdsAsync();
      }

      const questionsBank = await fetchJson(filePath(lang, level));
      if (!questionsBank?.questions?.length) {
        AVAIL[key] = false;
        REPORT[key] = { servable: false, deficits: [{ message: 'questions.json missing or empty' }] };
        return false;
      }

      const [passagesFile, wsFile, blueprint] = await Promise.all([
        fetchJson(passagesPath(lang, level)),
        fetchJson(writingSpeakingPath(lang, level)),
        fetchJson(blueprintPath(lang, level)),
      ]);

      const report = assessFromData(lang, level, questionsBank, passagesFile, wsFile, blueprint);
      REPORT[key] = report;
      AVAIL[key] = report.servable;
      return report.servable;
    } catch (_) {
      AVAIL[key] = false;
      REPORT[key] = { servable: false, deficits: [{ message: 'probe failed' }] };
      return false;
    }
  }

  async function probeAllLevels(lang) {
    const levels = ADVERTISED[lang] || [];
    await Promise.all(levels.map((level) => probeLevel(lang, level)));
    return supportedLevels(lang);
  }

  async function probeAll() {
    const langs = Object.keys(ADVERTISED);
    await Promise.all(langs.map((l) => probeAllLevels(l)));
    return langs.reduce((acc, l) => {
      acc[l] = supportedLevels(l);
      return acc;
    }, {});
  }

  async function load(lang, level) {
    const key = cacheKey(lang, level);
    if (CACHE[key]) return CACHE[key];
    const res = await fetch(filePath(lang, level));
    if (!res.ok) throw new Error(`Question library not found for ${lang} ${level}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.questions) || !data.questions.length) {
      throw new Error(`Question library is empty for ${lang} ${level}`);
    }
    CACHE[key] = data;

    if (AVAIL[key] === undefined) {
      await probeLevel(lang, level);
    }
    if (!hasLibrary(lang, level)) {
      const msg = REPORT[key]?.deficits?.map((d) => d.message).join('; ') || 'level not servable';
      throw new Error(`Question library insufficient for ${lang} ${level}: ${msg}`);
    }
    return data;
  }

  function getPassage(bank, passageId) {
    if (typeof PassageResolver !== 'undefined') {
      return PassageResolver.getPassageFromBank(bank, passageId);
    }
    return (bank.passages || []).find((p) => p.id === passageId) || null;
  }

  function questionsByModule(bank, module) {
    return (bank.questions || []).filter((q) => q.module === module);
  }

  function lookupVocabulary(bank, word) {
    if (!bank?.vocabulary || !word) return null;
    const key = Object.keys(bank.vocabulary).find((k) => k.toLowerCase() === String(word).toLowerCase());
    return key ? { word: key, ...bank.vocabulary[key] } : null;
  }

  return {
    ADVERTISED,
    SUPPORTED: ADVERTISED,
    hasLibrary,
    supportedLevels,
    advertisedLevels,
    getServabilityReport,
    probeLevel,
    probeAllLevels,
    probeAll,
    load,
    getPassage,
    questionsByModule,
    lookupVocabulary,
    filePath,
    passagesPath,
    writingSpeakingPath,
  };
})();

if (typeof window !== 'undefined') window.LibraryLoader = LibraryLoader;
if (typeof module !== 'undefined') module.exports = LibraryLoader;
