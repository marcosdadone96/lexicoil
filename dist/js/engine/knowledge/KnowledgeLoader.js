/**
 * Loads canonical knowledge JSON from /knowledge/ (Phase 04).
 * Browser: fetch. Node: filesystem (tests, scripts).
 */
let NODE_KNOWLEDGE_ROOT = null;
try {
  if (typeof __dirname !== 'undefined') {
    NODE_KNOWLEDGE_ROOT = require('path').join(__dirname, '..', '..', '..', 'knowledge');
  }
} catch (_) {
  /* browser */
}

const KnowledgeLoader = (() => {
  const cache = new Map();

  async function fetchJson(relPath) {
    const key = relPath.replace(/^\/+/, '');
    if (cache.has(key)) return cache.get(key);

    let data;
    if (NODE_KNOWLEDGE_ROOT) {
      const fs = require('fs');
      const path = require('path');
      const full = path.join(NODE_KNOWLEDGE_ROOT, key.replace(/\//g, path.sep));
      data = JSON.parse(fs.readFileSync(full, 'utf8'));
    } else {
      const url = `/knowledge/${key}`.replace(/\/+/g, '/');
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Knowledge load failed: ${key} (${res.status})`);
      data = await res.json();
    }

    cache.set(key, data);
    return data;
  }

  async function loadCefrLevel(level) {
    const l = String(level).toUpperCase();
    return fetchJson(`cefr/${l}.json`);
  }

  async function loadLanguage(languageId) {
    const id = String(languageId).toLowerCase();
    return fetchJson(`languages/${id}.json`);
  }

  async function loadProvider(providerId) {
    const id = String(providerId).toLowerCase();
    return fetchJson(`providers/${id}.json`);
  }

  function clearCache() {
    cache.clear();
  }

  return Object.freeze({
    loadCefrLevel,
    loadLanguage,
    loadProvider,
    clearCache,
  });
})();

if (typeof window !== 'undefined') window.KnowledgeLoader = KnowledgeLoader;
if (typeof module !== 'undefined') module.exports = KnowledgeLoader;
