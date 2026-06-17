/**
 * Accessibility helpers — screen announcements + focus on SPA screen change.
 */
(function () {
  const LIVE_ID = 'lcScreenAnnouncer';
  const SCREEN_TITLES = {
    homeScreen: 'Dashboard',
    goalWorkspaceScreen: 'Goal workspace',
    examConfigScreen: 'Exam configurator',
    oralPracticeScreen: 'Oral practice',
    profileSetupScreen: 'Profile setup',
    loadingScreen: 'Loading',
    examScreen: 'Exam',
    resultsScreen: 'Results',
    mistakeReviewScreen: 'Mistake review',
    flashcardScreen: 'Flashcards',
    vocabExamScreen: 'Vocabulary quiz',
  };

  function ensureAnnouncer() {
    let el = document.getElementById(LIVE_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = LIVE_ID;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      el.className = 'sr-only';
      document.body.appendChild(el);
    }
    return el;
  }

  function screenTitle(screenId) {
    return SCREEN_TITLES[screenId] || 'LexiCoil';
  }

  function announce(msg) {
    if (!msg) return;
    const el = ensureAnnouncer();
    el.textContent = '';
    requestAnimationFrame(() => {
      el.textContent = msg;
    });
  }

  function focusScreen(screenId) {
    const el = document.getElementById(screenId);
    if (!el || el.style.display === 'none') return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    if (!el.getAttribute('role')) el.setAttribute('role', 'main');
    try {
      el.focus({ preventScroll: false });
    } catch (_) {
      el.focus();
    }
  }

  function onScreenShown(screenId) {
    announce('Showing ' + screenTitle(screenId));
    focusScreen(screenId);
  }

  window.LcA11y = {
    announce,
    focusScreen,
    screenTitle,
    onScreenShown,
  };
})();
