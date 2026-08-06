// Unified "Saved practice" panel in vocabulary hub (quiz + phrases + listening).
(function () {
  function section(label, cardsHtml) {
    if (!cardsHtml) return '';
    return (
      `<div class="svp-section">` +
      `<p class="svp-section-lbl">${esc(label)}</p>` +
      `<div class="svq-list">${cardsHtml}</div>` +
      `</div>`
    );
  }

  function renderSavedPracticeHtml(goal, fromVocab) {
    if (!goal) return '';
    const quizCards =
      typeof SavedVocabQuizzes !== 'undefined' && SavedVocabQuizzes.renderCardsHtml
        ? SavedVocabQuizzes.renderCardsHtml(goal, fromVocab)
        : typeof SavedVocabQuizzes !== 'undefined'
          ? innerQuizCards(goal, fromVocab)
          : '';
    const phraseCards =
      typeof SavedVocabPhrases !== 'undefined'
        ? SavedVocabPhrases.renderCardsHtml(goal, fromVocab)
        : '';
    const listenCards =
      typeof SavedListeningGames !== 'undefined'
        ? SavedListeningGames.renderCardsHtml(goal)
        : '';
    const fcCards =
      typeof SavedFlashcardSets !== 'undefined'
        ? SavedFlashcardSets.renderCardsHtml(goal)
        : '';
    if (!quizCards && !phraseCards && !listenCards && !fcCards) return '';

    const vt = typeof vocabT === 'function' ? vocabT() : null;
    const lede =
      vt?.savedPracticeLede ||
      'AI sessions you generated are saved here — replay anytime without spending credits.';

    return (
      `<div class="ws-panel vv-saved-practice-panel">` +
      `<p class="ws-seclbl">${vt?.savedPracticeTitle || 'Saved practice'}</p>` +
      `<p class="svq-lede">${esc(lede)}</p>` +
      section(vt?.savedQuizzesLbl || 'Quiz', quizCards) +
      section(vt?.savedPhrasesLbl || 'Phrases', phraseCards) +
      section(vt?.savedListeningLbl || 'Listening', listenCards) +
      section(vt?.savedFlashcardsLbl || 'Flashcards', fcCards) +
      `</div>`
    );
  }

  /** Fallback if renderCardsHtml not on quizzes yet */
  function innerQuizCards(goal, fromVocab) {
    const html = SavedVocabQuizzes.renderSavedQuizzesHtml(goal, fromVocab);
    if (!html) return '';
    const m = html.match(/<div class="svq-list">([\s\S]*)<\/div>\s*<\/div>\s*$/);
    return m ? m[1] : '';
  }

  function refreshDom(goal) {
    if (typeof document === 'undefined') return;
    const g =
      goal || (typeof getActiveGoal === 'function' ? getActiveGoal() : null);
    const hubHtml = g ? renderSavedPracticeHtml(g, true) : '';
    const hub = document.getElementById('wsPanelVocabulary');
    if (hub && g) {
      const existing = hub.querySelector('.vv-saved-practice-panel');
      if (hubHtml) {
        if (existing) existing.outerHTML = hubHtml;
        else hub.insertAdjacentHTML('beforeend', hubHtml);
      } else if (existing) existing.remove();
    }
    const deckEl = document.getElementById('fcSavedQuizzes');
    if (deckEl && g) {
      deckEl.innerHTML = renderSavedPracticeHtml(g, false);
    }
  }

  window.SavedVocabPractice = {
    renderSavedPracticeHtml,
    refreshDom,
  };
})();
