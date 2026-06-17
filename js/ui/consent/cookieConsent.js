/**
 * GDPR/ePrivacy cookie consent — informative, non-blocking (functional storage only today).
 * Future analytics/marketing: load only after lcConsent.granted(category).
 */
(function () {
  const STORAGE_KEY = 'lc_cookie_consent';
  const CONSENT_VERSION = 1;

  /** @typedef {{ v:number, ts:number, necessary:boolean, analytics:boolean, marketing:boolean, choice:'accept'|'reject'|'custom' }} ConsentState */

  let state = null;
  let root = null;
  let prefsPanel = null;
  let previousFocus = null;
  let reopenMode = false;
  let lang = 'en';
  let strings = null;
  const readyCallbacks = [];
  const pendingHooks = { analytics: [], marketing: [] };

  function t(key) {
    return (strings && strings[key]) || key;
  }

  function readStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== CONSENT_VERSION) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeStored(next) {
    state = { ...next, v: CONSENT_VERSION, ts: Date.now(), necessary: true };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
    flushPending();
    readyCallbacks.splice(0).forEach((fn) => {
      try {
        fn(state);
      } catch (_) {}
    });
  }

  function defaultRejectState() {
    return {
      v: CONSENT_VERSION,
      ts: Date.now(),
      necessary: true,
      analytics: false,
      marketing: false,
      choice: 'reject',
    };
  }

  function defaultAcceptState() {
    return {
      v: CONSENT_VERSION,
      ts: Date.now(),
      necessary: true,
      analytics: true,
      marketing: true,
      choice: 'accept',
    };
  }

  function granted(category) {
    const cat = String(category || '').toLowerCase();
    if (cat === 'necessary' || cat === 'functional' || cat === 'essential') return true;
    if (!state) return false;
    if (cat === 'analytics') return !!state.analytics;
    if (cat === 'marketing') return !!state.marketing;
    return false;
  }

  function whenGranted(category, fn) {
    if (typeof fn !== 'function') return;
    const cat = String(category || '').toLowerCase();
    if (granted(cat)) {
      fn();
      return;
    }
    if (cat === 'analytics' || cat === 'marketing') {
      pendingHooks[cat].push(fn);
    }
  }

  function flushPending() {
    ['analytics', 'marketing'].forEach((cat) => {
      if (!granted(cat)) return;
      const list = pendingHooks[cat].splice(0);
      list.forEach((fn) => {
        try {
          fn();
        } catch (_) {}
      });
    });
  }

  function getState() {
    return state ? { ...state } : null;
  }

  function focusableIn(el) {
    return Array.from(
      el.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => node.offsetParent !== null || node === document.activeElement);
  }

  function trapFocus(container, event) {
    if (event.key !== 'Tab' || !container) return;
    const items = focusableIn(container);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function announce(msg) {
    if (typeof window.LcA11y !== 'undefined' && LcA11y.announce) LcA11y.announce(msg);
  }

  function hideBanner() {
    if (!root) return;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lc-consent-open');
    if (previousFocus && typeof previousFocus.focus === 'function') {
      try {
        previousFocus.focus();
      } catch (_) {}
    }
    previousFocus = null;
  }

  function showPrefs(open) {
    if (!prefsPanel || !root) return;
    prefsPanel.hidden = !open;
    prefsPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    root.classList.toggle('lc-consent--prefs-open', open);
    if (open) {
      const saveBtn = prefsPanel.querySelector('[data-lc-consent-save]');
      if (saveBtn) saveBtn.focus();
    } else {
      if (reopenMode) {
        hideBanner();
        reopenMode = false;
        return;
      }
      const prefsBtn = root.querySelector('[data-lc-consent-prefs]');
      if (prefsBtn) prefsBtn.focus();
    }
  }

  function applyChoice(next) {
    writeStored(next);
    hideBanner();
    announce(t('announceSaved'));
  }

  function onAccept() {
    applyChoice(defaultAcceptState());
  }

  function onReject() {
    applyChoice(defaultRejectState());
  }

  function onSavePrefs() {
    const analyticsEl = prefsPanel.querySelector('[data-lc-consent-analytics]');
    const marketingEl = prefsPanel.querySelector('[data-lc-consent-marketing]');
    applyChoice({
      necessary: true,
      analytics: !!analyticsEl?.checked,
      marketing: !!marketingEl?.checked,
      choice: 'custom',
    });
  }

  function onKeydown(event) {
    if (!root || root.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (prefsPanel && !prefsPanel.hidden) {
        showPrefs(false);
        return;
      }
      if (reopenMode) {
        hideBanner();
        reopenMode = false;
        return;
      }
      onReject();
      return;
    }
    const trapTarget = prefsPanel && !prefsPanel.hidden ? prefsPanel : root;
    trapFocus(trapTarget, event);
  }

  function renderBanner() {
    if (root) return root;
    lang = typeof resolveConsentLang === 'function' ? resolveConsentLang() : 'en';
    strings = typeof consentStrings === 'function' ? consentStrings(lang) : {};

    root = document.createElement('div');
    root.id = 'lcCookieConsent';
    root.className = 'lc-consent';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-labelledby', 'lcConsentTitle');
    root.setAttribute('aria-describedby', 'lcConsentDesc');
    root.setAttribute('aria-hidden', 'true');
    root.hidden = true;
    root.lang = lang;

    root.innerHTML = `
      <div class="lc-consent__bar">
        <div class="lc-consent__copy">
          <p id="lcConsentTitle" class="lc-consent__title">${t('title')}</p>
          <p id="lcConsentDesc" class="lc-consent__text">${t('body')}
            <a href="/privacy.html#cookies" class="lc-consent__link">${t('privacyLink')}</a>
          </p>
        </div>
        <div class="lc-consent__actions" role="group" aria-label="${t('title')}">
          <button type="button" class="lc-consent__btn lc-consent__btn--primary" data-lc-consent-accept>${t('accept')}</button>
          <button type="button" class="lc-consent__btn" data-lc-consent-reject>${t('reject')}</button>
          <button type="button" class="lc-consent__btn lc-consent__btn--ghost" data-lc-consent-prefs aria-expanded="false" aria-controls="lcConsentPrefsPanel">${t('preferences')}</button>
        </div>
      </div>
      <div id="lcConsentPrefsPanel" class="lc-consent__prefs" role="dialog" aria-labelledby="lcPrefsTitle" aria-hidden="true" hidden>
        <p id="lcPrefsTitle" class="lc-consent__prefs-title">${t('prefsTitle')}</p>
        <p class="lc-consent__prefs-intro">${t('prefsIntro')}</p>
        <ul class="lc-consent__cats">
          <li class="lc-consent__cat">
            <label class="lc-consent__cat-label">
              <input type="checkbox" checked disabled aria-disabled="true">
              <span><strong>${t('catNecessary')}</strong> <em class="lc-consent__tag">${t('alwaysOn')}</em></span>
            </label>
            <span class="lc-consent__cat-hint">${t('catNecessaryHint')}</span>
          </li>
          <li class="lc-consent__cat">
            <label class="lc-consent__cat-label">
              <input type="checkbox" data-lc-consent-analytics>
              <span><strong>${t('catAnalytics')}</strong></span>
            </label>
            <span class="lc-consent__cat-hint">${t('catAnalyticsHint')}</span>
          </li>
          <li class="lc-consent__cat">
            <label class="lc-consent__cat-label">
              <input type="checkbox" data-lc-consent-marketing>
              <span><strong>${t('catMarketing')}</strong></span>
            </label>
            <span class="lc-consent__cat-hint">${t('catMarketingHint')}</span>
          </li>
        </ul>
        <div class="lc-consent__prefs-actions">
          <button type="button" class="lc-consent__btn lc-consent__btn--primary" data-lc-consent-save>${t('save')}</button>
          <button type="button" class="lc-consent__btn" data-lc-consent-back>${t('back')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    prefsPanel = root.querySelector('#lcConsentPrefsPanel');

    root.querySelector('[data-lc-consent-accept]').addEventListener('click', onAccept);
    root.querySelector('[data-lc-consent-reject]').addEventListener('click', onReject);
    root.querySelector('[data-lc-consent-prefs]').addEventListener('click', () => {
      const prefsBtn = root.querySelector('[data-lc-consent-prefs]');
      const open = prefsPanel.hidden;
      prefsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      showPrefs(open);
    });
    root.querySelector('[data-lc-consent-save]').addEventListener('click', onSavePrefs);
    root.querySelector('[data-lc-consent-back]').addEventListener('click', () => {
      root.querySelector('[data-lc-consent-prefs]').setAttribute('aria-expanded', 'false');
      showPrefs(false);
    });
    root.addEventListener('keydown', onKeydown);

    return root;
  }

  function showBanner() {
    renderBanner();
    previousFocus = document.activeElement;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lc-consent-open');
    const acceptBtn = root.querySelector('[data-lc-consent-accept]');
    if (acceptBtn) acceptBtn.focus();
    announce(t('announceShown'));
  }

  function openPreferences() {
    renderBanner();
    reopenMode = !!state;
    if (state) {
      const a = prefsPanel.querySelector('[data-lc-consent-analytics]');
      const m = prefsPanel.querySelector('[data-lc-consent-marketing]');
      if (a) a.checked = !!state.analytics;
      if (m) m.checked = !!state.marketing;
    }
    previousFocus = document.activeElement;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lc-consent-open');
    root.querySelector('[data-lc-consent-prefs]').setAttribute('aria-expanded', 'true');
    showPrefs(true);
  }

  function onReady(fn) {
    if (typeof fn !== 'function') return;
    if (state) {
      fn(state);
      return;
    }
    readyCallbacks.push(fn);
  }

  function init() {
    state = readStored();
    if (state) {
      flushPending();
      readyCallbacks.splice(0).forEach((fn) => {
        try {
          fn(state);
        } catch (_) {}
      });
      return;
    }
    showBanner();
  }

  window.lcConsent = Object.freeze({
    granted,
    whenGranted,
    getState,
    onReady,
    openPreferences,
    STORAGE_KEY,
  });

  window.CookieConsent = Object.freeze({ init, openPreferences });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
