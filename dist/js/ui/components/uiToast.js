/* Lightweight toast notifications */
(function () {
  let hideTimer = null;

  window.showToast = function showToast(message, type = 'info', durationMs = 3800) {
    let el = document.getElementById('lcToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lcToast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      Object.assign(el.style, {
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%) translateY(12px)',
        zIndex: '99999',
        maxWidth: 'min(420px, calc(100vw - 32px))',
        padding: '12px 18px',
        borderRadius: '12px',
        fontSize: '13px',
        fontWeight: '600',
        lineHeight: '1.45',
        boxShadow: '0 8px 32px rgba(0,0,0,.45)',
        opacity: '0',
        transition: 'opacity .2s ease, transform .2s ease',
        pointerEvents: 'none',
      });
      document.body.appendChild(el);
    }

    const colors = {
      info: { bg: 'rgba(36,36,41,.96)', border: 'rgba(255,255,255,.12)', text: '#f4f4f5' },
      success: { bg: 'rgba(20,50,35,.96)', border: 'rgba(93,232,160,.35)', text: '#b8f5d4' },
      warn: { bg: 'rgba(55,35,15,.96)', border: 'rgba(249,115,22,.35)', text: '#ffd8b0' },
      error: { bg: 'rgba(55,20,20,.96)', border: 'rgba(232,93,93,.35)', text: '#ffc9c9' },
    };
    const c = colors[type] || colors.info;
    el.style.background = c.bg;
    el.style.border = `1px solid ${c.border}`;
    el.style.color = c.text;
    el.textContent = String(message || '');

    clearTimeout(hideTimer);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
    });
    hideTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(12px)';
    }, durationMs);
  };
})();
