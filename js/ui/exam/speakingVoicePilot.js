/**
 * Client cache for Sprechen voice pilot eligibility (server-gated).
 */
const SpeakingVoicePilot = (() => {
  /** @type {boolean|null} */
  let _eligible = null;
  /** @type {Promise<boolean>|null} */
  let _loadPromise = null;

  async function load() {
    if (_eligible !== null) return _eligible;
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
      try {
        if (typeof isPaidPlan !== 'function' || !isPaidPlan()) {
          _eligible = false;
          return false;
        }
        if (typeof Auth !== 'undefined' && Auth.isGuest && Auth.isGuest()) {
          _eligible = false;
          return false;
        }
        const fetchFn = typeof lcFetch === 'function' ? lcFetch : fetch;
        const res = await fetchFn('/.netlify/functions/speaking-voice-pilot', {
          method: 'GET',
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        _eligible = !!(res.ok && data.ok && data.eligible);
        return _eligible;
      } catch (_) {
        _eligible = false;
        return false;
      } finally {
        _loadPromise = null;
      }
    })();

    return _loadPromise;
  }

  function isEligible() {
    return _eligible === true;
  }

  function reset() {
    _eligible = null;
    _loadPromise = null;
  }

  return { load, isEligible, reset };
})();

if (typeof window !== 'undefined') window.SpeakingVoicePilot = SpeakingVoicePilot;
