/**
 * Provider adapter registry — routes provider id → adapter
 */
const ProviderRegistry = (() => {
  const ADAPTER_FILES = Object.freeze({
    goethe: 'goetheAdapter.js',
    cambridge: 'cambridgeAdapter.js',
    dele: 'deleAdapter.js',
  });

  const ADAPTERS = () => {
    const pick = (id, globalName) => {
      if (typeof window !== 'undefined' && window[globalName]) return window[globalName];
      return require('./' + ADAPTER_FILES[id]);
    };
    return {
      goethe: pick('goethe', 'GoetheAdapter'),
      cambridge: pick('cambridge', 'CambridgeAdapter'),
      dele: pick('dele', 'DELEAdapter'),
    };
  };

  function getAdapter(providerId) {
    const id = String(providerId || '').toLowerCase();
    const adapter = ADAPTERS()[id];
    if (!adapter) {
      const err = new Error('Unknown provider adapter: ' + providerId);
      err.code = 'unknown_provider';
      throw err;
    }
    return adapter;
  }

  function listIds() {
    return Object.keys(ADAPTERS());
  }

  /**
   * @param {string} providerId
   * @param {object} providerData loaded JSON
   * @param {string} level CEFR
   * @param {string} languageId normalized language
   */
  function apply(providerId, providerData, level, languageId) {
    const adapter = getAdapter(providerId);
    if (adapter.languageId !== languageId) {
      const err = new Error(
        `Provider ${providerId} is for ${adapter.languageId}, not ${languageId}`,
      );
      err.code = 'provider_language_mismatch';
      throw err;
    }
    return adapter.adapt(providerData, level);
  }

  return Object.freeze({
    getAdapter,
    listIds,
    apply,
    ADAPTERS,
  });
})();

if (typeof window !== 'undefined') window.ProviderRegistry = ProviderRegistry;
if (typeof module !== 'undefined') module.exports = ProviderRegistry;
