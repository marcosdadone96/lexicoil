/**
 * Keyboard navigation for flashcard deck (flip + next/prev).
 */
(function () {
  function bindFlashcardKeyboard() {
    const scr = document.getElementById('flashcardScreen');
    if (!scr || scr.style.display !== 'block') return;

    scr.setAttribute('role', 'main');
    scr.setAttribute('aria-label', 'Flashcards');

    if (scr._fcKeyBound) return;
    scr._fcKeyBound = true;

    scr.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (typeof toggleFcSingleFlip === 'function' && document.getElementById('fcSingleInner')) {
          e.preventDefault();
          toggleFcSingleFlip();
          return;
        }
        const card = document.querySelector('.fc-card:not(.flipped):focus-within, .fc-card:hover');
        if (card && card.id && card.id.startsWith('fc_') && typeof flipCard === 'function') {
          e.preventDefault();
          flipCard(card.id.slice(3));
        }
      }
      if (e.key === 'ArrowRight') {
        const nextBtn = document.querySelector('.fc-single-nav .btn-sm.accent:not([disabled])');
        if (nextBtn) {
          e.preventDefault();
          nextBtn.click();
        }
      }
      if (e.key === 'ArrowLeft') {
        const prevBtn = document.querySelector('.fc-single-nav .btn-sm:not(.accent):not([disabled])');
        if (prevBtn && prevBtn.textContent.indexOf('Prev') >= 0) {
          e.preventDefault();
          prevBtn.click();
        }
      }
    });
  }

  window.bindFlashcardKeyboard = bindFlashcardKeyboard;
})();
