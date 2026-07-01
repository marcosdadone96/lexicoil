/**
 * Phrases & expressions by level — content/phrases/<taughtLang>/<metaLang>/<level>.json
 */
const PhrasesLoader = (() => {
  const factory =
    typeof createContentLoader === 'function'
      ? createContentLoader
      : typeof require === 'function'
        ? require('./contentLoader.js').createContentLoader
        : null;
  if (!factory) throw new Error('contentLoader.js must load before phrasesLoader.js');
  return factory({
  contentType: 'phrases',
  bases: ['content/phrases', 'lexicoil_reference_content/content/phrases'],
  defaultManifest: { metaLanguages: ['en', 'es'], defaultMetaLanguage: 'en', published: {} },
  });
})();

async function getPhrases(taughtLang, level, metaLang) {
  return PhrasesLoader.getContent(taughtLang, level, metaLang);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PhrasesLoader, getPhrases };
}
