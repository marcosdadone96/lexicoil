/**
 * In-app feedback form — POST /.netlify/functions/submit-feedback
 */
(function () {
  'use strict';

  function currentPage() {
    if (typeof getActiveScreenId === 'function') {
      return getActiveScreenId() || 'unknown';
    }
    return 'unknown';
  }

  function loggedInEmail() {
    if (typeof S !== 'undefined' && S.user && S.user.email) return S.user.email;
    if (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()?.email) {
      return Auth.getUser().email;
    }
    return '';
  }

  function openFeedbackModal() {
    if (typeof closeUserMenu === 'function') closeUserMenu();
    const modal = document.getElementById('feedbackModal');
    if (!modal) return;
    const msg = document.getElementById('feedbackMessage');
    const email = document.getElementById('feedbackEmail');
    const err = document.getElementById('feedbackError');
    if (msg) msg.value = '';
    if (err) err.textContent = '';
    if (email) {
      const pre = loggedInEmail();
      email.value = pre || '';
      email.placeholder = pre ? '' : 'you@example.com (optional)';
    }
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    if (msg) msg.focus();
  }

  function closeFeedbackModal() {
    const modal = document.getElementById('feedbackModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function submitFeedbackForm() {
    const msgEl = document.getElementById('feedbackMessage');
    const emailEl = document.getElementById('feedbackEmail');
    const errEl = document.getElementById('feedbackError');
    const btn = document.getElementById('feedbackSubmitBtn');
    const message = msgEl ? msgEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';

    if (errEl) errEl.textContent = '';
    if (message.length < 5) {
      if (errEl) errEl.textContent = 'Please write at least a few words.';
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
    }

    try {
      const fetchFn = typeof lcApiFetch === 'function' ? lcApiFetch : fetch;
      const res = await fetchFn('/.netlify/functions/submit-feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          email: email || undefined,
          page: currentPage(),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        if (errEl) errEl.textContent = 'Too many messages — try again in an hour.';
        return;
      }
      if (!res.ok) {
        const map = {
          message_too_short: 'Please write at least a few words.',
          message_too_long: 'Message is too long (max 2000 characters).',
          invalid_email: 'Please enter a valid email or leave it blank.',
          too_many_links: 'Too many links — send a short note instead.',
          spam_pattern: 'Message could not be sent. Try rephrasing.',
        };
        if (errEl) {
          errEl.textContent =
            map[data.error] || 'Could not send feedback. Try again or email contact@lexicoil.com.';
        }
        return;
      }

      closeFeedbackModal();
      if (typeof lcToast === 'function') {
        lcToast('Thanks! We will read it.', 'success');
      }
    } catch (_) {
      if (errEl) {
        errEl.textContent = 'Network error — try again or email contact@lexicoil.com.';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send feedback';
      }
    }
  }

  window.openFeedbackModal = openFeedbackModal;
  window.closeFeedbackModal = closeFeedbackModal;
  window.submitFeedbackForm = submitFeedbackForm;
})();
