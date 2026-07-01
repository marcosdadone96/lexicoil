/**
 * Vocabulary by level — content/vocabulary/<taughtLang>/<metaLang>/<level>.json
 */
const VocabularyLoader = (() => {
  const factory =
    typeof createContentLoader === 'function'
      ? createContentLoader
      : typeof require === 'function'
        ? require('./contentLoader.js').createContentLoader
        : null;
  if (!factory) throw new Error('contentLoader.js must load before vocabularyLoader.js');
  return factory({
  contentType: 'vocabulary',
  bases: ['content/vocabulary', 'lexicoil_reference_content/content/vocabulary'],
  defaultManifest: { metaLanguages: ['en', 'es'], defaultMetaLanguage: 'en', published: {} },
  });
})();

async function getVocabulary(taughtLang, level, metaLang) {
  return VocabularyLoader.getContent(taughtLang, level, metaLang);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VocabularyLoader, getVocabulary };
}
