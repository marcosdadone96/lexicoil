/**
 * LexiCoil domain model — Phase 03
 * Core types and ContentSpecification factory.
 * No prompts, no LLM, no UI.
 */
const LexiCoilDomain = (() => {
  const ENGINE_VERSION = '1.0.0';

  const CEFR_LEVELS = Object.freeze(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

  const LANGUAGES = Object.freeze({
    german: Object.freeze({
      id: 'german',
      code: 'de',
      name: 'German',
      nativeName: 'Deutsch',
      locale: 'de-DE',
    }),
    english: Object.freeze({
      id: 'english',
      code: 'en',
      name: 'English',
      nativeName: 'English',
      locale: 'en-GB',
    }),
    spanish: Object.freeze({
      id: 'spanish',
      code: 'es',
      name: 'Spanish',
      nativeName: 'Español',
      locale: 'es-ES',
    }),
  });

  const PROVIDERS = Object.freeze({
    goethe: Object.freeze({
      id: 'goethe',
      name: 'Goethe-Institut',
      languageIds: ['german'],
      levels: [...CEFR_LEVELS],
    }),
    cambridge: Object.freeze({
      id: 'cambridge',
      name: 'Cambridge Assessment English',
      languageIds: ['english'],
      levels: [...CEFR_LEVELS],
    }),
    dele: Object.freeze({
      id: 'dele',
      name: 'Instituto Cervantes (DELE)',
      languageIds: ['spanish'],
      levels: [...CEFR_LEVELS],
    }),
  });

  const CONTENT_TYPES = Object.freeze({
    Exam: Object.freeze({
      id: 'Exam',
      label: 'Full Exam',
      requiredSkills: ['reading', 'listening', 'writing', 'speaking'],
      supportsChunking: true,
      requiresProvider: true,
    }),
    MiniExam: Object.freeze({
      id: 'MiniExam',
      label: 'Mini Exam',
      requiredSkills: ['reading', 'listening'],
      supportsChunking: true,
      requiresProvider: false,
    }),
    ReadingExercise: Object.freeze({
      id: 'ReadingExercise',
      label: 'Reading',
      requiredSkills: ['reading'],
      supportsChunking: false,
      requiresProvider: false,
    }),
    ListeningExercise: Object.freeze({
      id: 'ListeningExercise',
      label: 'Listening',
      requiredSkills: ['listening'],
      supportsChunking: false,
      requiresProvider: false,
    }),
    WritingExercise: Object.freeze({
      id: 'WritingExercise',
      label: 'Writing',
      requiredSkills: ['writing'],
      supportsChunking: false,
      requiresProvider: false,
    }),
    SpeakingExercise: Object.freeze({
      id: 'SpeakingExercise',
      label: 'Speaking',
      requiredSkills: ['speaking'],
      supportsChunking: false,
      requiresProvider: false,
    }),
    GrammarExercise: Object.freeze({
      id: 'GrammarExercise',
      label: 'Grammar',
      requiredSkills: ['grammar'],
      supportsChunking: false,
      requiresProvider: false,
    }),
    VocabularyExercise: Object.freeze({
      id: 'VocabularyExercise',
      label: 'Vocabulary',
      requiredSkills: ['vocabulary'],
      supportsChunking: false,
      requiresProvider: false,
    }),
    Flashcards: Object.freeze({
      id: 'Flashcards',
      label: 'Flashcards',
      requiredSkills: ['vocabulary'],
      supportsChunking: false,
      requiresProvider: false,
    }),
    Story: Object.freeze({
      id: 'Story',
      label: 'Story',
      requiredSkills: ['reading', 'vocabulary'],
      supportsChunking: false,
      requiresProvider: false,
    }),
    Dialogue: Object.freeze({
      id: 'Dialogue',
      label: 'Dialogue',
      requiredSkills: ['listening', 'speaking'],
      supportsChunking: false,
      requiresProvider: false,
    }),
    Quiz: Object.freeze({
      id: 'Quiz',
      label: 'Quiz',
      requiredSkills: ['vocabulary'],
      supportsChunking: false,
      requiresProvider: false,
    }),
  });

  const LANGUAGE_ALIASES = Object.freeze({
    de: 'german',
    german: 'german',
    deutsch: 'german',
    en: 'english',
    english: 'english',
    es: 'spanish',
    spanish: 'spanish',
    español: 'spanish',
    espanol: 'spanish',
  });

  const PROVIDER_ALIASES = Object.freeze({
    goethe: 'goethe',
    'goethe-institut': 'goethe',
    cambridge: 'cambridge',
    dele: 'dele',
    cervantes: 'dele',
  });

  function isCefrLevel(level) {
    return typeof level === 'string' && CEFR_LEVELS.includes(level.toUpperCase());
  }

  function normalizeCefrLevel(level) {
    if (!level) return null;
    const u = String(level).trim().toUpperCase();
    return CEFR_LEVELS.includes(u) ? u : null;
  }

  function normalizeLanguageId(input) {
    if (!input) return null;
    const key = String(input).trim().toLowerCase();
    const id = LANGUAGE_ALIASES[key] || (LANGUAGES[key] ? key : null);
    return id && LANGUAGES[id] ? id : null;
  }

  function normalizeProviderId(input) {
    if (!input) return null;
    const key = String(input).trim().toLowerCase();
    const id = PROVIDER_ALIASES[key] || (PROVIDERS[key] ? key : null);
    return id && PROVIDERS[id] ? id : null;
  }

  function normalizeContentType(input) {
    if (!input) return null;
    const key = String(input).trim();
    if (CONTENT_TYPES[key]) return key;
    const found = Object.keys(CONTENT_TYPES).find(
      (k) => k.toLowerCase() === key.toLowerCase(),
    );
    return found || null;
  }

  /** @typedef {object} GrammarTopic */
  /** @property {string} id */
  /** @property {string} languageId */
  /** @property {string} level */
  /** @property {string} label */
  /** @property {string} [description] */

  /** @typedef {object} VocabularyDomain */
  /** @property {string} id */
  /** @property {string} languageId */
  /** @property {string} level */
  /** @property {string[]} topics */

  /** @typedef {object} CanDoStatement */
  /** @property {string} id */
  /** @property {string} level */
  /** @property {string} skill */
  /** @property {string} statement */

  /** @typedef {object} AssessmentCriterion */
  /** @property {string} id */
  /** @property {string} [providerId] */
  /** @property {string} skill */
  /** @property {object} bands */

  /**
   * @typedef {object} ContentSpecification
   * @property {string} language
   * @property {string} level
   * @property {string} [provider]
   * @property {string} contentType
   * @property {string[]} [targetWords]
   * @property {string[]} [grammarTopics]
   * @property {string[]} [vocabularyDomains]
   * @property {string[]} [canDoStatements]
   * @property {object} [constraints]
   * @property {object} [examStructure]
   * @property {string} [topic]
   * @property {string[]} [skills]
   * @property {object} [outputSchema]
   * @property {string} [locale]
   * @property {object} [metadata]
   */

  function validateContentSpecification(spec) {
    const errors = [];
    if (!spec || typeof spec !== 'object') {
      return { ok: false, errors: ['spec must be an object'] };
    }

    const language = normalizeLanguageId(spec.language);
    if (!language) errors.push('invalid or missing language');

    const level = normalizeCefrLevel(spec.level);
    if (!level) errors.push('invalid or missing level (A1–C2)');

    const contentType = normalizeContentType(spec.contentType);
    if (!contentType) errors.push('invalid or missing contentType');

    let provider = null;
    if (spec.provider != null && spec.provider !== '') {
      provider = normalizeProviderId(spec.provider);
      if (!provider) errors.push('invalid provider');
      else if (!PROVIDERS[provider].languageIds.includes(language)) {
        errors.push(`provider ${provider} does not support language ${language}`);
      }
    }

    const ct = contentType ? CONTENT_TYPES[contentType] : null;
    if (ct?.requiresProvider && !provider) {
      errors.push(`contentType ${contentType} requires provider`);
    }

    if (Array.isArray(spec.targetWords)) {
      spec.targetWords.forEach((w, i) => {
        if (typeof w !== 'string' || !w.trim()) errors.push(`targetWords[${i}] must be a non-empty string`);
      });
    }

    return { ok: errors.length === 0, errors, normalized: { language, level, contentType, provider } };
  }

  /**
   * Create a validated ContentSpecification (throws on invalid input).
   * @param {Partial<ContentSpecification>} partial
   * @returns {ContentSpecification}
   */
  function createContentSpecification(partial) {
    const input = partial || {};
    const language = normalizeLanguageId(input.language);
    const level = normalizeCefrLevel(input.level);
    const contentType = normalizeContentType(input.contentType);
    const provider = input.provider ? normalizeProviderId(input.provider) : undefined;

    const spec = {
      language,
      level,
      contentType,
      ...(provider ? { provider } : {}),
      ...(Array.isArray(input.targetWords) && input.targetWords.length
        ? { targetWords: [...input.targetWords] }
        : {}),
      ...(Array.isArray(input.grammarTopics) && input.grammarTopics.length
        ? { grammarTopics: [...input.grammarTopics] }
        : {}),
      ...(Array.isArray(input.vocabularyDomains) && input.vocabularyDomains.length
        ? { vocabularyDomains: [...input.vocabularyDomains] }
        : {}),
      ...(Array.isArray(input.canDoStatements) && input.canDoStatements.length
        ? { canDoStatements: [...input.canDoStatements] }
        : {}),
      ...(input.constraints && typeof input.constraints === 'object'
        ? { constraints: { ...input.constraints } }
        : {}),
      ...(input.examStructure && typeof input.examStructure === 'object'
        ? { examStructure: JSON.parse(JSON.stringify(input.examStructure)) }
        : {}),
      ...(input.topic ? { topic: String(input.topic) } : {}),
      ...(Array.isArray(input.skills) && input.skills.length ? { skills: [...input.skills] } : {}),
      ...(input.outputSchema && typeof input.outputSchema === 'object'
        ? { outputSchema: { ...input.outputSchema } }
        : {}),
      locale:
        input.locale ||
        (language && LANGUAGES[language] ? LANGUAGES[language].locale : undefined),
      metadata: {
        version: ENGINE_VERSION,
        ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
      },
    };

    const result = validateContentSpecification(spec);
    if (!result.ok) {
      const err = new Error('Invalid ContentSpecification: ' + result.errors.join('; '));
      err.code = 'invalid_content_spec';
      err.details = result.errors;
      throw err;
    }
    return spec;
  }

  function languageFromSubjectCode(code) {
    const map = { de: 'german', en: 'english', es: 'spanish' };
    return map[String(code || '').toLowerCase()] || null;
  }

  function subjectCodeFromLanguage(languageId) {
    const lang = LANGUAGES[languageId];
    return lang ? lang.code : null;
  }

  return Object.freeze({
    ENGINE_VERSION,
    CEFR_LEVELS,
    LANGUAGES,
    PROVIDERS,
    CONTENT_TYPES,
    isCefrLevel,
    normalizeCefrLevel,
    normalizeLanguageId,
    normalizeProviderId,
    normalizeContentType,
    validateContentSpecification,
    createContentSpecification,
    languageFromSubjectCode,
    subjectCodeFromLanguage,
  });
})();

if (typeof window !== 'undefined') window.LexiCoilDomain = LexiCoilDomain;
if (typeof module !== 'undefined') module.exports = LexiCoilDomain;
