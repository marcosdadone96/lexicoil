/**
 * Base provider adapter — structure/timing/scoring/task types only. No prompts.
 */
const BaseProviderAdapter = (() => {
  const FORBIDDEN_KEYS = new Set([
    'prompt',
    'prompts',
    'buildPrompt',
    'instruction',
    'systemPrompt',
    'userPrompt',
  ]);

  const MODULE_EXPECT_KEYS = Object.freeze({
    german: Object.freeze({
      lesen: 'lesenParts',
      horen: 'horenParts',
      schreiben: 'schreibenParts',
      sprechen: 'sprechenParts',
    }),
    english: Object.freeze({
      reading: 'readingParts',
      listening: 'listeningParts',
      writing: 'writingParts',
      speaking: 'speakingParts',
    }),
    spanish: Object.freeze({
      reading: 'readingParts',
      listening: 'listeningParts',
      writing: 'writingParts',
      speaking: 'speakingParts',
    }),
  });

  function assertNoPrompts(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) assertNoPrompts(obj[i], `${path}[${i}]`);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (FORBIDDEN_KEYS.has(k)) {
        throw new Error(`Provider data must not contain prompt key "${k}" at ${path}`);
      }
      if (typeof v === 'object' && v !== null) assertNoPrompts(v, `${path}.${k}`);
    }
  }

  function buildChunkPlan(languageId, providerLevel) {
    if (!providerLevel?.modules?.length) return [];
    const keyMap = MODULE_EXPECT_KEYS[languageId] || MODULE_EXPECT_KEYS.english;
    return providerLevel.modules.map((m) => ({
      expectKey: keyMap[m.id] || `${m.id}Parts`,
      moduleId: m.id,
      title: m.title,
      parts: m.parts,
      minutes: m.minutes,
      taskTypes: providerLevel.taskTypes?.[m.id] || [],
    }));
  }

  function buildExamStructure(providerData, providerLevel) {
    if (!providerLevel) return undefined;
    return {
      board: providerData?.name || providerData?.id || '',
      certificate: providerLevel.certificate,
      totalMinutes: providerLevel.totalMinutes,
      modules: providerLevel.modules ? [...providerLevel.modules] : [],
      scoring: providerLevel.scoring ? { ...providerLevel.scoring } : undefined,
      taskTypes: providerLevel.taskTypes ? { ...providerLevel.taskTypes } : undefined,
    };
  }

  /**
   * @param {object} providerData full knowledge/providers/{id}.json
   * @param {string} level CEFR level
   * @param {string} languageId normalized language id
   */
  function adapt(providerData, level, languageId) {
    assertNoPrompts(providerData, providerData?.id || 'provider');
    const providerLevel = providerData?.levels?.[level];
    if (!providerLevel) {
      const err = new Error(`Provider ${providerData?.id} has no level config for ${level}`);
      err.code = 'provider_level_missing';
      throw err;
    }
    if (providerData.languageId && providerData.languageId !== languageId) {
      const err = new Error(
        `Provider ${providerData.id} (${providerData.languageId}) does not match language ${languageId}`,
      );
      err.code = 'provider_language_mismatch';
      throw err;
    }
    return {
      examStructure: buildExamStructure(providerData, providerLevel),
      chunkPlan: buildChunkPlan(languageId, providerLevel),
    };
  }

  return Object.freeze({
    MODULE_EXPECT_KEYS,
    FORBIDDEN_KEYS,
    assertNoPrompts,
    buildChunkPlan,
    buildExamStructure,
    adapt,
  });
})();

if (typeof window !== 'undefined') window.BaseProviderAdapter = BaseProviderAdapter;
if (typeof module !== 'undefined') module.exports = BaseProviderAdapter;
