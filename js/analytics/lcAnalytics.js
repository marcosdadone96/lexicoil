/**
 * GA4 custom events — no-op unless analytics cookie consent is granted.
 * Never send PII or exam content; metadata only (level, board, score, module).
 */
(function () {
  'use strict';

  function hasAnalyticsConsent() {
    return typeof window.lcConsent !== 'undefined' && window.lcConsent.granted('analytics');
  }

  function boardForLang(lang) {
    if (typeof SubjectMeta !== 'undefined' && SubjectMeta.get) {
      return SubjectMeta.get(lang || 'de').board;
    }
    if (lang === 'en') return 'Cambridge English';
    if (lang === 'es') return 'Instituto Cervantes';
    return 'Goethe-Institut';
  }

  function sanitizeParams(params) {
    if (!params || typeof params !== 'object') return {};
    var out = {};
    Object.keys(params).forEach(function (key) {
      var v = params[key];
      if (v == null || v === '') return;
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) return;
        out[key] = Math.round(v);
        return;
      }
      if (typeof v === 'string') {
        out[key] = v.length > 64 ? v.slice(0, 64) : v;
      }
    });
    return out;
  }

  function trackEvent(name, params) {
    if (!hasAnalyticsConsent()) return;
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', String(name || 'event'), sanitizeParams(params));
  }

  function trackSignUp() {
    trackEvent('sign_up');
  }

  function trackExamStarted(lang, level) {
    trackEvent('exam_started', {
      level: level || 'B1',
      board: boardForLang(lang),
    });
  }

  function trackExamCompleted(lang, level, score) {
    var payload = {
      level: level || 'B1',
      board: boardForLang(lang),
    };
    if (typeof score === 'number' && Number.isFinite(score)) payload.score = Math.round(score);
    trackEvent('exam_completed', payload);
  }

  function trackPersonalizedExamGenerated(moduleOrSkills) {
    var mod = Array.isArray(moduleOrSkills) ? moduleOrSkills.join(',') : String(moduleOrSkills || '');
    trackEvent('personalized_exam_generated', { module: mod });
  }

  function trackUpgradeClicked(plan) {
    trackEvent('upgrade_clicked', { plan: plan || 'pro' });
  }

  window.LcAnalytics = Object.freeze({
    hasAnalyticsConsent,
    trackEvent,
    trackSignUp,
    trackExamStarted,
    trackExamCompleted,
    trackPersonalizedExamGenerated,
    trackUpgradeClicked,
  });

  if (typeof module !== 'undefined') module.exports = window.LcAnalytics;
})();
