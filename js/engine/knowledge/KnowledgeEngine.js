/**
 * KnowledgeEngine — Phase 05
 * Merges CEFR + Language + Provider (+ user vocabulary) → ContentSpecification
 * No prompts. No LLM.
 */
const KnowledgeEngine = (() => {
  const DEFAULT_PROVIDER_BY_LANGUAGE = Object.freeze({
    german: 'goethe',
    english: 'cambridge',
    spanish: 'dele',
  });

  function getRegistry() {
    if (typeof ProviderRegistry !== 'undefined') return ProviderRegistry;
    return require('../providers/providerRegistry.js');
  }

  function getBaseAdapter() {
    if (typeof BaseProviderAdapter !== 'undefined') return BaseProviderAdapter;
    return require('../providers/baseProviderAdapter.js');
  }

  function getDomain() {
    if (typeof LexiCoilDomain !== 'undefined') return LexiCoilDomain;
    return require('../domain/lexicoilDomain.js');
  }

  function getLoader() {
    if (typeof KnowledgeLoader !== 'undefined') return KnowledgeLoader;
    return require('./KnowledgeLoader.js');
  }

  function pick(arr) {
    if (!arr?.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function flattenCanDo(cefr) {
    const out = [];
    const cd = cefr?.canDo || {};
    for (const skill of ['reading', 'listening', 'writing', 'speaking', 'interaction']) {
      for (const stmt of cd[skill] || []) {
        if (stmt && typeof stmt === 'string') out.push(stmt);
      }
    }
    return out;
  }

  function grammarTopicLabels(langData, level) {
    return (langData?.grammar?.[level] || []).map((g) => g.topic || g.label || g.id).filter(Boolean);
  }

  function mergeGrammarTopics(langData, cefr, level) {
    const fromLang = grammarTopicLabels(langData, level);
    const fromCefr = cefr?.grammarExpectations || [];
    return [...new Set([...fromLang, ...fromCefr])];
  }

  function buildConstraints(cefr, chunkPlan) {
    const tl = cefr?.textLength || {};
    const constraints = {};
    if (cefr?.vocabularySize) constraints.vocabularySize = { ...cefr.vocabularySize };
    if (tl.readingWords) constraints.readingWordCount = { ...tl.readingWords };
    if (tl.listeningWords) constraints.listeningWordCount = { ...tl.listeningWords };
    if (tl.writingWords) constraints.writingWordCount = { ...tl.writingWords };
    if (tl.speakingMinutes) constraints.speakingMinutes = { ...tl.speakingMinutes };
    if (chunkPlan.length) constraints.chunkPlan = chunkPlan.map((c) => ({ ...c }));
    return constraints;
  }

  function resolveProviderId(languageId, explicitProvider, contentType, Domain) {
    const normalized = explicitProvider ? Domain.normalizeProviderId(explicitProvider) : null;
    if (normalized) return normalized;
    const ct = Domain.CONTENT_TYPES[contentType];
    if (ct?.requiresProvider) return DEFAULT_PROVIDER_BY_LANGUAGE[languageId] || null;
    return null;
  }

  function resolveLanguageId(languageOrSubject) {
    const Domain = getDomain();
    return (
      Domain.normalizeLanguageId(languageOrSubject) ||
      Domain.languageFromSubjectCode(languageOrSubject)
    );
  }

  function pickTopic(langData, level, input) {
    if (input.topic) return String(input.topic);
    const topics = langData?.topics?.[level];
    if (input.targetWords?.length) {
      return pick(topics) || 'Personalized vocabulary practice';
    }
    return pick(topics);
  }

  /** Topics for a CEFR level from knowledge/languages/{id}.json */
  async function listTopics(languageOrSubject, level) {
    const Domain = getDomain();
    const languageId = resolveLanguageId(languageOrSubject);
    const lv = Domain.normalizeCefrLevel(level);
    if (!languageId || !lv) return [];
    const langData = await getLoader().loadLanguage(languageId);
    const topics = langData?.topics?.[lv];
    return Array.isArray(topics) ? [...topics] : [];
  }

  /** Random topic from knowledge base (subject code de|en|es or language id). */
  async function pickRandomTopic(languageOrSubject, level) {
    const topics = await listTopics(languageOrSubject, level);
    return pick(topics) || 'General practice';
  }

  /**
   * @param {object} input
   * @param {string} input.language
   * @param {string} input.level
   * @param {string} [input.provider]
   * @param {string} [input.contentType]
   * @param {string[]} [input.targetWords]
   * @param {string} [input.topic]
   * @param {string[]} [input.skills]
   * @param {object} [input.metadata]
   */
  async function buildSpec(input) {
    const Domain = getDomain();
    const Loader = getLoader();
    const req = input || {};

    const languageId = Domain.normalizeLanguageId(req.language);
    const level = Domain.normalizeCefrLevel(req.level);
    const contentType = Domain.normalizeContentType(req.contentType || 'Exam');

    if (!languageId || !level || !contentType) {
      const err = new Error('buildSpec requires valid language, level, and contentType');
      err.code = 'invalid_build_spec_input';
      throw err;
    }

    const providerId = resolveProviderId(languageId, req.provider, contentType, Domain);
    const ct = Domain.CONTENT_TYPES[contentType];
    const useProvider =
      !!ct?.requiresProvider ||
      ((contentType === 'Exam' || contentType === 'MiniExam') && !!providerId);
    const effectiveProviderId = useProvider ? providerId : null;

    const [cefr, langData] = await Promise.all([
      Loader.loadCefrLevel(level),
      Loader.loadLanguage(languageId),
    ]);

    let examStructure;
    let chunkPlan = [];
    if (effectiveProviderId) {
      const provData = await Loader.loadProvider(effectiveProviderId);
      const adapted = getRegistry().apply(effectiveProviderId, provData, level, languageId);
      examStructure = adapted.examStructure;
      chunkPlan = adapted.chunkPlan;
    }
    const topic = pickTopic(langData, level, req);

    const partial = {
      language: languageId,
      level,
      contentType,
      ...(effectiveProviderId ? { provider: effectiveProviderId } : {}),
      grammarTopics: mergeGrammarTopics(langData, cefr, level),
      vocabularyDomains: [...(langData.vocabularyDomains?.[level] || [])],
      canDoStatements: flattenCanDo(cefr),
      constraints: buildConstraints(cefr, chunkPlan),
      ...(examStructure ? { examStructure } : {}),
      ...(topic ? { topic } : {}),
      ...(Array.isArray(req.skills) && req.skills.length
        ? { skills: [...req.skills] }
        : ct?.requiredSkills
          ? { skills: [...ct.requiredSkills] }
          : {}),
      ...(Array.isArray(req.targetWords) && req.targetWords.length
        ? { targetWords: req.targetWords.filter((w) => typeof w === 'string' && w.trim()) }
        : {}),
      metadata: {
        source: 'knowledge_engine',
        ...(req.metadata && typeof req.metadata === 'object' ? req.metadata : {}),
      },
    };

    return Domain.createContentSpecification(partial);
  }

  return Object.freeze({
    buildSpec,
    buildConstraints,
    pickTopic,
    listTopics,
    pickRandomTopic,
    resolveLanguageId,
    DEFAULT_PROVIDER_BY_LANGUAGE,
    getRegistry,
    getBaseAdapter,
  });
})();

if (typeof window !== 'undefined') window.KnowledgeEngine = KnowledgeEngine;
if (typeof module !== 'undefined') module.exports = KnowledgeEngine;
