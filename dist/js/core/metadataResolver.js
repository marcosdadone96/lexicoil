/**
 * Metadata resolver — hierarchy: question > part/module > exam root > CEFR default.
 * Additive only; old exams without tags resolve to safe defaults.
 */
const MetadataResolver = (() => {
  const T = typeof LexiCoilMetadataTypes !== 'undefined' ? LexiCoilMetadataTypes : null;
  const DIFF_MIN = T?.DIFFICULTY_MIN ?? 1;
  const DIFF_MAX = T?.DIFFICULTY_MAX ?? 10;
  const LEVEL_DEFAULTS = T?.LEVEL_DEFAULT_DIFFICULTY ?? { A1: 2, A2: 3, B1: 5, B2: 6, C1: 8, C2: 9 };

  const EMPTY = Object.freeze({
    grammarTags: [],
    topicTags: [],
    vocabularyTags: [],
    difficulty: null,
  });

  function normalizeStringArray(value) {
    if (value == null) return [];
    if (Array.isArray(value)) {
      return value
        .filter((x) => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
  }

  function normalizeDifficulty(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(DIFF_MIN, Math.min(DIFF_MAX, Math.round(n)));
  }

  function defaultDifficultyFromExam(exam) {
    const level = exam?.level;
    if (!level || LEVEL_DEFAULTS[level] == null) return null;
    return LEVEL_DEFAULTS[level];
  }

  function pickArray(question, part, exam, key) {
    const q = normalizeStringArray(question?.[key]);
    if (q.length) return q;
    const p = normalizeStringArray(part?.[key]);
    if (p.length) return p;
    const e = normalizeStringArray(exam?.[key]);
    if (e.length) return e;
    return [];
  }

  function pickDifficulty(question, part, exam) {
    let d = normalizeDifficulty(question?.difficulty);
    if (d != null) return d;
    d = normalizeDifficulty(part?.difficulty);
    if (d != null) return d;
    d = normalizeDifficulty(exam?.difficulty);
    if (d != null) return d;
    return defaultDifficultyFromExam(exam);
  }

  /**
   * Resolve optional metadata for one scorable entity.
   * @param {object|null|undefined} question — question, item, segment, gap sentence, etc.
   * @param {object|null|undefined} part — parent module part (lesenParts[i], etc.)
   * @param {object|null|undefined} exam — exam root
   * @returns {{ grammarTags: string[], topicTags: string[], vocabularyTags: string[], difficulty: number|null }}
   */
  function resolveQuestionMetadata(question, part, exam) {
    if (!question && !part && !exam) return { ...EMPTY };
    return {
      grammarTags: pickArray(question, part, exam, 'grammarTags'),
      topicTags: pickArray(question, part, exam, 'topicTags'),
      vocabularyTags: pickArray(question, part, exam, 'vocabularyTags'),
      difficulty: pickDifficulty(question, part, exam),
    };
  }

  /** Part keys used across all coexisting exam shapes. */
  const PART_KEYS = [
    'lesenParts',
    'horenParts',
    'schreibenParts',
    'sprechenParts',
    'readingParts',
    'listeningParts',
    'writingParts',
    'speakingParts',
  ];

  const QUESTION_CHILD_KEYS = ['questions', 'items', 'segments', 'noteFields'];

  /**
   * Walk all scorable entities and yield resolved metadata (for future analytics).
   * Does not mutate exam JSON.
   */
  function* walkResolvedMetadata(exam) {
    if (!exam || typeof exam !== 'object') return;

    for (const partKey of PART_KEYS) {
      const parts = exam[partKey];
      if (!Array.isArray(parts)) continue;
      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi];
        for (const childKey of QUESTION_CHILD_KEYS) {
          const children = part?.[childKey];
          if (!Array.isArray(children)) continue;
          for (let ci = 0; ci < children.length; ci++) {
            const child = children[ci];
            if (!child || typeof child !== 'object') continue;
            const scorable =
              child.correct != null ||
              child.answer != null ||
              (child.options && child.correct != null) ||
              child.type === 'gap_fill' ||
              child.type === 'gap';
            if (!scorable && childKey !== 'noteFields') continue;
            yield {
              path: `${partKey}[${pi}].${childKey}[${ci}]`,
              partKey,
              partIndex: pi,
              childKey,
              childIndex: ci,
              metadata: resolveQuestionMetadata(child, part, exam),
            };
          }
        }
      }
    }

    const legacy = [
      ['lesen', 'questions'],
      ['horen', 'questions'],
      ['reading', 'questions'],
      ['listening', 'questions'],
      ['gapfill', 'sentences'],
    ];
    for (const [modKey, childKey] of legacy) {
      const mod = exam[modKey];
      if (!mod || typeof mod !== 'object') continue;
      const children = mod[childKey];
      if (!Array.isArray(children)) continue;
      for (let ci = 0; ci < children.length; ci++) {
        const child = children[ci];
        if (!child || typeof child !== 'object') continue;
        yield {
          path: `${modKey}.${childKey}[${ci}]`,
          partKey: modKey,
          partIndex: 0,
          childKey,
          childIndex: ci,
          metadata: resolveQuestionMetadata(child, mod, exam),
        };
      }
    }

    for (const skill of ['reading', 'listening']) {
      const block = exam[skill];
      if (!block || typeof block !== 'object' || !block.question) continue;
      yield {
        path: skill,
        partKey: skill,
        partIndex: 0,
        childKey: 'root',
        childIndex: 0,
        metadata: resolveQuestionMetadata(block, null, exam),
      };
    }
  }

  return Object.freeze({
    EMPTY,
    resolveQuestionMetadata,
    walkResolvedMetadata,
    normalizeStringArray,
    normalizeDifficulty,
    defaultDifficultyFromExam,
  });
})();

if (typeof window !== 'undefined') window.MetadataResolver = MetadataResolver;
if (typeof module !== 'undefined') module.exports = MetadataResolver;
