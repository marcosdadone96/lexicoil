/**
 * Personal pool topic stock — level/module registry (Phase A UX).
 */
const PersonalTopicStock = (() => {
  const PERSONAL_VOCAB_MIN_SELECT = 4;

  const EMBEDDED = Object.freeze({
    'de|B1|lesen': () =>
      typeof PersonalLesenTopicStock !== 'undefined' ? PersonalLesenTopicStock : null,
    'de|B1|horen': () =>
      typeof PersonalHorenTopicStock !== 'undefined' ? PersonalHorenTopicStock : null,
  });

  function normalizeLevel(level) {
    return String(level || 'B1').toUpperCase();
  }

  function cacheKey(lang, level, module) {
    return `${String(lang || 'de').toLowerCase()}|${normalizeLevel(level)}|${String(module || 'lesen').toLowerCase()}`;
  }

  function topicsForLevel(level) {
    const lv = normalizeLevel(level);
    if (
      lv === 'A2' &&
      typeof A2Topics !== 'undefined' &&
      A2Topics.A2_OFFICIAL_TOPICS?.length
    ) {
      return [...A2Topics.A2_OFFICIAL_TOPICS];
    }
    if (typeof B1Topics !== 'undefined' && B1Topics.B1_TOPICS?.length) {
      return [...B1Topics.B1_TOPICS];
    }
    return ['Umwelt'];
  }

  function buildFallbackManifest(lang, level, module) {
    const topics = topicsForLevel(level);
    const teils =
      typeof ExamLevelLayout !== 'undefined'
        ? ExamLevelLayout.teilsForModule(level, module)
        : module === 'horen'
          ? [1, 2, 3, 4]
          : [1, 2, 3, 4, 5];
    const rows = topics.map((topic) => ({
      topic,
      counts: Object.fromEntries(teils.map((t) => [String(t), 0])),
      total: 0,
      filled: 0,
      missing: [...teils],
      full: false,
      status: 'sparse',
    }));
    return {
      v: 2,
      lang: String(lang || 'de').toLowerCase(),
      level: normalizeLevel(level),
      module: String(module || 'lesen').toLowerCase(),
      teils,
      topics: rows,
      fallback: true,
    };
  }

  function forModule(lang, level, module) {
    const mod = String(module || 'lesen').toLowerCase();
    const key = cacheKey(lang, level, mod);
    const factory = EMBEDDED[key];
    if (factory) {
      const stock = factory();
      if (stock) return stock;
    }
    const manifest = buildFallbackManifest(lang, level, mod);
    const teilCount = manifest.teils.length;
    const labels =
      mod === 'horen'
        ? { de: 'Hören', en: 'Listening' }
        : { de: 'Lesen', en: 'Reading' };
    return PersonalTopicStockFactory.create(manifest, {
      module: mod,
      moduleLabel: labels,
      teilCount,
    });
  }

  function skillUsesTopicPicker(skill) {
    const s = String(skill || '').toLowerCase();
    return s === 'lesen' || s === 'reading' || s === 'horen' || s === 'listening';
  }

  function supportsTopicPicker(goal, skill) {
    if (!goal || String(goal.subject || '').toLowerCase() !== 'de') return false;
    if (!skillUsesTopicPicker(skill)) return false;
    return true;
  }

  function stockForConfig(goal, activeSkill) {
    if (!goal) return null;
    const skill = activeSkill || 'lesen';
    if (!supportsTopicPicker(goal, skill)) return null;
    const mod = skill === 'horen' || skill === 'listening' ? 'horen' : 'lesen';
    return forModule(goal.subject, goal.level, mod);
  }

  function refreshSuggestedTopic(examConfig, goal, words) {
    if (!examConfig || examConfig.topicTouched || !goal) return;
    const skill = configActiveSkillKeyFromSet(examConfig.skills);
    const stock = stockForConfig(goal, skill);
    if (!stock || !words?.length) return;
    examConfig.topicChoice = stock.pickDefaultTopicForWords(words);
  }

  function configActiveSkillKeyFromSet(skills) {
    const s = skills instanceof Set ? skills : new Set(skills || ['lesen']);
    if (s.has('lesen')) return 'lesen';
    if (s.has('horen')) return 'horen';
    return 'lesen';
  }

  function applySuggestedTopicFromSelection(examConfig, goal) {
    if (!examConfig?.selectedIds?.size || !goal || examConfig.topicTouched) return;
    const deck =
      typeof deckForGoal === 'function'
        ? deckForGoal(goal).filter((f) => examConfig.selectedIds.has(typeof fcId === 'function' ? fcId(f) : f.id))
        : [];
    const words = deck.map((f) => f.word);
    refreshSuggestedTopic(examConfig, goal, words);
  }

  /** Display/banners for assembled personal pool exams (Lesen or Hören). */
  function stockForPersonalExam(exam, examLang, moduleHint) {
    const lang = String(examLang || exam?.lang || 'de').toLowerCase();
    const level = exam?.level || 'B1';
    let mod = moduleHint ? String(moduleHint).toLowerCase() : null;
    if (!mod) {
      const lesenN = exam?.lesenParts?.length || 0;
      const horenN = exam?.horenParts?.length || 0;
      mod = horenN && !lesenN ? 'horen' : 'lesen';
    }
    return forModule(lang, level, mod);
  }

  return Object.freeze({
    PERSONAL_VOCAB_MIN_SELECT,
    forModule,
    supportsTopicPicker,
    skillUsesTopicPicker,
    stockForConfig,
    stockForPersonalExam,
    refreshSuggestedTopic,
    applySuggestedTopicFromSelection,
    buildFallbackManifest,
  });
})();

if (typeof window !== 'undefined') window.PersonalTopicStock = PersonalTopicStock;
if (typeof module !== 'undefined') module.exports = PersonalTopicStock;
