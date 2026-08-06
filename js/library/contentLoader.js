/**
 * Generic manifest-driven reference content loader.
 * Path: <base>/<taughtLang>/<metaLang>/<level>.json
 */
function createContentLoader(config) {
  const {
    contentType = 'content',
    bases = [],
    defaultManifest = { metaLanguages: ['es'], defaultMetaLanguage: 'es', published: {} },
  } = config;

  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  let _manifest = null;

  function baseUrls() {
    return bases.map((b) => String(b).replace(/\/$/, ''));
  }

  async function fetchJson(url) {
    try {
      const r = await fetch(url, { cache: 'default' });
      if (!r.ok) return null;
      return await r.json();
    } catch (_) {
      return null;
    }
  }

  async function loadManifest() {
    if (_manifest) return _manifest;
    for (const base of baseUrls()) {
      const data = await fetchJson(base + '/manifest.json');
      if (data && typeof data === 'object') {
        _manifest = data;
        return _manifest;
      }
    }
    _manifest = { ...defaultManifest };
    return _manifest;
  }

  function userMetaLanguage() {
    const pref =
      typeof resolveVocabUiLang === 'function'
        ? resolveVocabUiLang()
        : typeof translationLang === 'function'
          ? translationLang()
          : typeof S !== 'undefined' && S.fcLang
            ? S.fcLang
            : null;
    try {
      return pref || localStorage.getItem('lc_ui_lang') || localStorage.getItem('lc_pref_xlat') || defaultManifest.defaultMetaLanguage || 'en';
    } catch (_) {
      return pref || defaultManifest.defaultMetaLanguage || 'en';
    }
  }

  function isPublished(taughtLang, metaLang, level, manifest) {
    const pub = manifest?.published?.[taughtLang]?.[metaLang];
    return Array.isArray(pub) && pub.includes(level);
  }

  function publishedMetaLanguages(taughtLang, manifest) {
    const block = manifest?.published?.[taughtLang];
    if (!block || typeof block !== 'object') return [];
    return Object.keys(block).filter((m) => Array.isArray(block[m]) && block[m].length);
  }

  function publishedLevels(taughtLang, metaLang, manifest) {
    const list = manifest?.published?.[taughtLang]?.[metaLang];
    return Array.isArray(list) ? list.filter((l) => LEVELS.includes(l)) : [];
  }

  function metaLangFallbackOrder(requested, manifest) {
    const order = [];
    const push = (m) => {
      if (m && !order.includes(m)) order.push(m);
    };
    push(requested);
    push(manifest?.defaultMetaLanguage);
    (manifest?.metaLanguages || []).forEach(push);
    ['es', 'en', 'de'].forEach(push);
    return order;
  }

  async function getContent(taughtLang, level, metaLang) {
    const taught = String(taughtLang || 'de').toLowerCase();
    const lvl = String(level || 'A1').toUpperCase();
    const manifest = await loadManifest();
    const requested = metaLang || userMetaLanguage();

    for (const meta of metaLangFallbackOrder(requested, manifest)) {
      if (!isPublished(taught, meta, lvl, manifest)) continue;
      for (const base of baseUrls()) {
        const url = base + '/' + taught + '/' + meta + '/' + lvl + '.json';
        const doc = await fetchJson(url);
        if (doc && doc.sections && doc.status !== 'draft') {
          return { doc, metaLanguage: meta, taughtLang: taught, level: lvl, status: 'ok', contentType };
        }
      }
    }

    return {
      doc: null,
      metaLanguage: requested,
      taughtLang: taught,
      level: lvl,
      status: 'preparation',
      contentType,
    };
  }

  function resetCache() {
    _manifest = null;
  }

  return {
    contentType,
    LEVELS,
    bases,
    loadManifest,
    getContent,
    isPublished,
    publishedMetaLanguages,
    publishedLevels,
    userMetaLanguage,
    metaLangFallbackOrder,
    resetCache,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createContentLoader };
}
if (typeof window !== 'undefined') {
  window.createContentLoader = createContentLoader;
}
