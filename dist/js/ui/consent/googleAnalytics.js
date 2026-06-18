/**
 * Google Analytics 4 — loads only after analytics cookie consent (GDPR / Consent Mode v2).
 */
(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-HMZCS7TE33';
  var loaded = false;

  function ensureDataLayer() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
    }
  }

  function setDefaultConsentDenied() {
    ensureDataLayer();
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      wait_for_update: 500,
    });
  }

  function grantAnalyticsConsent() {
    ensureDataLayer();
    gtag('consent', 'update', {
      analytics_storage: 'granted',
    });
  }

  function loadGtag() {
    if (loaded) return;
    loaded = true;
    grantAnalyticsConsent();

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    script.onload = function () {
      gtag('js', new Date());
      gtag('config', MEASUREMENT_ID, { anonymize_ip: true });
    };
    document.head.appendChild(script);
  }

  setDefaultConsentDenied();

  function init() {
    if (typeof window.lcConsent === 'undefined') return;
    lcConsent.whenGranted('analytics', loadGtag);
    lcConsent.onReady(function (state) {
      if (state && state.analytics) loadGtag();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
