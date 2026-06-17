/**
 * Goethe-Institut provider adapter — exam structure only (no prompts).
 */
const GoetheAdapter = (() => {
  const ID = 'goethe';
  const LANGUAGE_ID = 'german';

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

if (typeof window !== 'undefined') window.GoetheAdapter = GoetheAdapter;
if (typeof module !== 'undefined') module.exports = GoetheAdapter;
