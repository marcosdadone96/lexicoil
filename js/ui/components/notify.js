/* Unified toast-or-alert notification */
(function () {
  window.notify = function notify(message, type, durationMs) {
    if (typeof showToast === 'function') {
      showToast(message, type || 'info', durationMs == null ? 3800 : durationMs);
    } else {
      alert(message);
    }
  };
})();
