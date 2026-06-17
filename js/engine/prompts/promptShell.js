/**
 * Shared prompt shell — language-parameterized, not level/provider-specific files.
 */
const PromptShell = (() => {
  const JSON_RULES =
    'Return ONE JSON object (not an array). Escape double quotes in strings. No markdown. Start with { end with }.';

  const LOCALES = {
    german: {
      anti:
        'CRITICO: Genera contenido REAL y AUTENTICO. NINGUN placeholder. Los textos deben tener la longitud indicada. Las preguntas deben ser verificables en los textos generados.',
      global:
        'Devuelve SOLO JSON valido. TODO el contenido debe ser AUTENTICO y COMPLETO. CERO placeholders ("...", "Option A", "Text here", "Ein Text ueber", etc.).',
      badGood: (topic) =>
        `MALO: {"text":"Ein Text ueber ${topic}."} BIEN: {"text":"Maria arbeitet seit drei Jahren als Krankenschwester in Berlin..."}`,
      contentLang: 'German',
      langCode: 'de',
    },
    english: {
      anti:
        'CRITICAL: Generate REAL, COMPLETE, AUTHENTIC content. NO placeholders whatsoever. All texts must be FULLY WRITTEN with the specified word count.',
      global:
        'Return ONLY valid JSON. ALL content must be AUTHENTIC and COMPLETE. ZERO placeholders ("...", "Option A", "An article about", etc.).',
      badGood: (topic) =>
        `BAD: {"text":"An article about ${topic}."} GOOD: {"text":"Every summer, thousands of tourists visit the coastal town of Whitby..."}`,
      contentLang: 'English',
      langCode: 'en',
    },
    spanish: {
      anti:
        'CRITICO: Genera contenido REAL y AUTENTICO en espanol. NINGUN placeholder. Textos con la longitud indicada.',
      global:
        'Devuelve SOLO JSON valido en espanol. Contenido AUTENTICO y COMPLETO. CERO placeholders.',
      badGood: (topic) =>
        `MALO: {"text":"Un texto sobre ${topic}."} BIEN: {"text":"Cada verano, miles de turistas visitan la costa andaluza..."}`,
      contentLang: 'Spanish',
      langCode: 'es',
    },
  };

  function getLocale(languageId) {
    return LOCALES[languageId] || LOCALES.english;
  }

  function examWriterHeader(spec, expectKey, moduleTitle) {
    const loc = getLocale(spec.language);
    const topic = spec.topic || 'general';
    const cert = spec.examStructure?.certificate || spec.provider || 'CEFR';
    const providerLine = spec.provider
      ? `${spec.provider} ${spec.level} (${cert}) exam writer.`
      : `CEFR ${spec.level} exam writer.`;

    return [
      loc.anti,
      `${providerLine} Topic: "${topic}". Language: ${loc.contentLang}.`,
      `Root keys: topic, level:"${spec.level}", lang:"${loc.langCode}", ${expectKey}.`,
      moduleTitle ? `Module: ${moduleTitle}.` : '',
      loc.badGood(topic),
      loc.global,
      JSON_RULES,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return Object.freeze({ getLocale, examWriterHeader, JSON_RULES });
})();

if (typeof window !== 'undefined') window.PromptShell = PromptShell;
if (typeof module !== 'undefined') module.exports = PromptShell;
