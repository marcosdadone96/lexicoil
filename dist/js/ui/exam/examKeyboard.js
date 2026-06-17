/**
 * Keyboard navigation for exam flow (options, submit bar).
 */
(function () {
  function focusableOptions(root) {
    return Array.from(
      root.querySelectorAll('.opt input[type=radio], .opt input[type=checkbox], .rf-btn, .gap-input, .write-field, #submitBtn'),
    ).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  function bindExamKeyboard() {
    const scr = document.getElementById('examScreen');
    if (!scr || scr.style.display !== 'block') return;

    scr.setAttribute('role', 'main');
    scr.setAttribute('aria-label', 'Exam');

    scr.querySelectorAll('.question-block').forEach((block, i) => {
      if (!block.id) block.id = 'qBlock_' + i;
      block.setAttribute('role', 'group');
      const legend = block.querySelector('.q-text, .q-prompt, h3, h4');
      if (legend) block.setAttribute('aria-label', legend.textContent.trim().slice(0, 120));
    });

    scr.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const opts = focusableOptions(scr);
      const idx = opts.indexOf(document.activeElement);
      if (idx < 0) return;
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(opts.length - 1, idx + 1) : Math.max(0, idx - 1);
      opts[next].focus();
    });
  }

  window.bindExamKeyboard = bindExamKeyboard;
})();
