/**
 * Cambridge Assessment English provider adapter — exam structure only (no prompts).
 */
const CambridgeAdapter = (() => {
  const ID = 'cambridge';
  const LANGUAGE_ID = 'english';

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

if (typeof window !== 'undefined') window.CambridgeAdapter = CambridgeAdapter;
if (typeof module !== 'undefined') module.exports = CambridgeAdapter;
