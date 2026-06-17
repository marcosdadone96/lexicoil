/**
 * Instituto Cervantes (DELE) provider adapter — exam structure only (no prompts).
 */
const DELEAdapter = (() => {
  const ID = 'dele';
  const LANGUAGE_ID = 'spanish';

  function getBase() {
    if (typeof BaseProviderAdapter !== 'undefined') return BaseProviderAdapter;
    return require('./baseProviderAdapter.js');
  }

  function adapt(providerData, level) {
    return getBase().adapt(providerData, level, LANGUAGE_ID);
  }

  return Object.freeze({
    id: ID,
    languageId: LANGUAGE_ID,
    adapt,
  });
})();

if (typeof window !== 'undefined') window.DELEAdapter = DELEAdapter;
if (typeof module !== 'undefined') module.exports = DELEAdapter;
