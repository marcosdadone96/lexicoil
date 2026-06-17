/* LexiCoil debug logging — gated behind DEBUG_LEXICOIL=1 or localStorage DEBUG_LEXICOIL */
(function () {
  function debugEnabled() {
    if (typeof window !== 'undefined' && window.DEBUG_LEXICOIL === '1') return true;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_LEXICOIL') === '1') return true;
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  window.lcDebug = {
    enabled: debugEnabled,
    log: function () {
      if (debugEnabled()) console.log.apply(console, arguments);
    },
    warn: function () {
      if (debugEnabled()) console.warn.apply(console, arguments);
    },
    error: function () {
      if (debugEnabled()) console.error.apply(console, arguments);
    },
  };
})();
