/**
 * Grammar content loader — manifest-driven, 3-level path:
 * content/grammar/<taughtLang>/<metaLang>/<level>.json
 */
const GrammarLoader = (() => {
  const factory =
    typeof createContentLoader === 'function'
      ? createContentLoader
      : typeof require === 'function'
        ? require('./contentLoader.js').createContentLoader
        : null;
  if (!factory) throw new Error('contentLoader.js must load before grammarLoader.js');
  const inner = factory({
    contentType: 'grammar',
    bases: ['content/grammar', 'lexicoil_grammar_content/content/grammar'],
    defaultManifest: { metaLanguages: ['es'], defaultMetaLanguage: 'es', published: {} },
  });

  async function getGrammar(taughtLang, level, metaLang) {
    return inner.getContent(taughtLang, level, metaLang);
  }

  return {
    LEVELS: inner.LEVELS,
    loadManifest: inner.loadManifest,
    getGrammar,
    getContent: inner.getContent,
    isPublished: inner.isPublished,
    publishedMetaLanguages: inner.publishedMetaLanguages,
    publishedLevels: inner.publishedLevels,
    userMetaLanguage: inner.userMetaLanguage,
    metaLangFallbackOrder: inner.metaLangFallbackOrder,
    resetCache: inner.resetCache,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GrammarLoader;
}
