/* Facade — pre-generated question library + dynamic exam assembly */
const QuestionLibrary = (() => {
  function burnedExcludes(options) {
    if (options && options.applyBurned === false) {
      return { excludeIds: options.excludeIds, applyBurned: false };
    }
    if (options && options.excludeIds) return { excludeIds: options.excludeIds, applyBurned: options.applyBurned };
    if (typeof BurnedRegistry !== 'undefined') {
      const { excludeIds } = BurnedRegistry.excludeSets();
      return { excludeIds, applyBurned: options?.applyBurned !== false };
    }
    return { excludeIds: undefined, applyBurned: false };
  }

  function hasLibrary(subject, level) {
    return typeof LibraryLoader !== 'undefined' && LibraryLoader.hasLibrary(subject, level);
  }

  function availableLevels(subject) {
    return LibraryLoader.supportedLevels(subject);
  }

  async function loadBlueprint(subject, level) {
    if (typeof ExamBlueprint === 'undefined' || !ExamBlueprint.hasBlueprint(subject, level)) return null;
    return ExamBlueprint.load(subject, level);
  }

  async function buildWithBlueprint(subject, level, bank, blueprint, options) {
    if (blueprint) return ExamBuilder.buildFromBlueprint(subject, level, bank, blueprint, options);
    return ExamBuilder.build(subject, level, bank, options);
  }

  async function buildExam(subject, level, options = {}) {
    const bank = await LibraryLoader.load(subject, level);
    const blueprint = options.blueprint || (await loadBlueprint(subject, level));
    let calibration = options.calibration || null;
    if (!calibration && typeof ItemCalibration !== 'undefined') {
      calibration = await ItemCalibration.loadAsync(subject, level);
    }
    return buildWithBlueprint(subject, level, bank, blueprint, {
      mode: 'standard',
      calibration,
      ...options,
      ...burnedExcludes(options),
    });
  }

  async function buildPersonalExam(subject, level, words, skills) {
    const bank = await LibraryLoader.load(subject, level);
    const blueprint = await loadBlueprint(subject, level);
    const matchCount = (bank.questions || []).filter((q) =>
      ExamBuilder.questionContainsWords(q, bank, words),
    ).length;
    const hasVocabMatch = matchCount > 0;
    const exam = await buildWithBlueprint(subject, level, bank, blueprint, {
      mode: 'personal',
      targetWords: words,
      skills: skills || ['lesen', 'horen'],
      vocabMatchCount: matchCount,
      vocabMatchFound: hasVocabMatch,
      ...burnedExcludes({}),
    });
    return exam;
  }

  async function buildWeaknessExam(subject, level, goal, options = {}) {
    return WeaknessEngine.buildWeaknessExam(subject, level, goal, options);
  }

  async function buildPersonalizedExam(subject, level, goal, options = {}) {
    const bank = await LibraryLoader.load(subject, level);
    const blueprint = options.blueprint || (await loadBlueprint(subject, level));
    if (!blueprint) throw new Error('Blueprint required for personalized exam');
    return WeaknessEngine.buildPersonalizedExam(goal, blueprint, bank, options);
  }

  async function lookupVocab(word, subject, level, targetLang) {
    return PracticeDictionary.lookup(word, subject, level, targetLang);
  }

  return {
    hasLibrary,
    availableLevels,
    loadBlueprint,
    buildExam,
    buildPersonalExam,
    buildWeaknessExam,
    buildPersonalizedExam,
    lookupVocab,
  };
})();

if (typeof window !== 'undefined') window.QuestionLibrary = QuestionLibrary;
