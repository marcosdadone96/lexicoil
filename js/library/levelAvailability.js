/**
 * Level UI status — servable library vs live-AI allow-list vs coming soon.
 * Positive allow-list replaces negative liveAiDisabled / ExamLibrary optimism.
 */
const LevelAvailability = (() => {
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const LANGS = ['de', 'en', 'es'];

  /** Combos where full AI exam generation is enabled without a servable question bank. */
  const LIVE_AI_ALLOWLIST = Object.freeze({
    de: [],
    en: [],
    es: [],
  });

  function globalLiveAiKillSwitch() {
    if (typeof window !== 'undefined') {
      if (window.LC_DISABLE_LIVE_AI === false) return false;
      if (window.LC_DISABLE_LIVE_AI === true) return true;
    }
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.LC_DISABLE_LIVE_AI === '0') return false;
      if (process.env.LC_DISABLE_LIVE_AI === '1') return true;
    }
    return false;
  }

  function isLiveAiAllowed(lang, level) {
    if (!lang || !level) return false;
    const list = LIVE_AI_ALLOWLIST[lang];
    return Array.isArray(list) && list.includes(level);
  }

  function isLiveAiEnabled(lang, level) {
    if (globalLiveAiKillSwitch()) return false;
    return isLiveAiAllowed(lang, level);
  }

  function isServableFromProbe(lang, level) {
    if (typeof LibraryLoader !== 'undefined') {
      if (typeof LibraryLoader.getServabilityReport === 'function') {
        const report = LibraryLoader.getServabilityReport(lang, level);
        if (report) return !!report.servable;
      }
      if (typeof LibraryLoader.hasLibrary === 'function') {
        const probed =
          typeof LibraryLoader.probeLevel === 'function' &&
          LibraryLoader.AVAIL &&
          LibraryLoader.AVAIL[`${lang}_${level}`] !== undefined;
        if (probed) return LibraryLoader.hasLibrary(lang, level);
      }
    }
    return null;
  }

  function isServableFromDisk(lang, level) {
    if (typeof module === 'undefined') return false;
    try {
      const fs = require('fs');
      const path = require('path');
      const ContentServable = require('./contentServable.js');
      const LibraryCatalog = require('./libraryCatalog.js');
      const root = process.cwd();
      const base = path.join(root, 'library', lang, level);
      const qPath = path.join(base, 'questions.json');
      if (!fs.existsSync(qPath)) return false;
      const questionsBank = JSON.parse(fs.readFileSync(qPath, 'utf8'));
      const passagesPath = path.join(base, 'passages.json');
      const wsPath = path.join(base, 'writing-speaking.json');
      const passagesFile = fs.existsSync(passagesPath)
        ? JSON.parse(fs.readFileSync(passagesPath, 'utf8'))
        : null;
      const wsFile = fs.existsSync(wsPath) ? JSON.parse(fs.readFileSync(wsPath, 'utf8')) : null;
      const bpId = LibraryCatalog.blueprintId(lang, level);
      const bpPath = bpId ? path.join(root, 'library/blueprints', `${bpId}.json`) : null;
      const blueprint = bpPath && fs.existsSync(bpPath) ? JSON.parse(fs.readFileSync(bpPath, 'utf8')) : null;
      ContentServable.loadThresholdsSync(fs.readFileSync, root);
      const passages = ContentServable.mergePassages(questionsBank.passages, passagesFile?.passages);
      return ContentServable.assessLevel({
        lang,
        level,
        questions: questionsBank.questions,
        passages,
        writingSpeaking: wsFile || { writing: [], speaking: [] },
        blueprint,
      }).servable;
    } catch (_) {
      return false;
    }
  }

  function isLevelServable(lang, level) {
    const probed = isServableFromProbe(lang, level);
    if (probed !== null) return probed;
    return isServableFromDisk(lang, level);
  }

  /**
   * @returns {'ready'|'live'|'soon'}
   */
  function getLevelUiStatus(lang, level) {
    if (isLevelServable(lang, level)) return 'ready';
    if (isLiveAiEnabled(lang, level)) return 'live';
    return 'soon';
  }

  function isLevelSelectable(lang, level) {
    return getLevelUiStatus(lang, level) !== 'soon';
  }

  function advertisedLevels(lang) {
    if (typeof LibraryCatalog !== 'undefined' && LibraryCatalog.advertisedLevels) {
      return LibraryCatalog.advertisedLevels(lang);
    }
    return [...LEVELS];
  }

  function selectableLevels(lang) {
    return advertisedLevels(lang).filter((level) => isLevelSelectable(lang, level));
  }

  function firstSelectableLevel(lang) {
    const sel = selectableLevels(lang);
    return sel[0] || advertisedLevels(lang)[0] || 'B1';
  }

  function liveAiDisabled(lang, level) {
    return !isLiveAiEnabled(lang, level);
  }

  function levelBadgeHtml(status, locale) {
    const es = locale === 'es';
    if (status === 'soon') {
      const label = es ? 'Próximamente' : 'Coming soon';
      return `<span class="exam-config-badge exam-config-badge--soon">${label}</span>`;
    }
    if (status === 'live') {
      return '<span class="exam-config-badge exam-config-badge--ready">AI</span>';
    }
    const label = es ? 'Listo' : 'Ready';
    return `<span class="exam-config-badge exam-config-badge--ready">${label}</span>`;
  }

  return {
    LEVELS,
    LANGS,
    LIVE_AI_ALLOWLIST,
    isLiveAiAllowed,
    isLiveAiEnabled,
    isLevelServable,
    getLevelUiStatus,
    isLevelSelectable,
    advertisedLevels,
    selectableLevels,
    firstSelectableLevel,
    liveAiDisabled,
    levelBadgeHtml,
  };
})();

if (typeof window !== 'undefined') window.LevelAvailability = LevelAvailability;
if (typeof module !== 'undefined') module.exports = LevelAvailability;
