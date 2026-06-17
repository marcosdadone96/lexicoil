/* Stripe checkout / Pro activation UI */
(function () {
  window.activatePro = async function () {
    if (typeof Auth !== 'undefined' && Auth.isGuest()) {
      closeUpgrade();
      switchTab('login');
      if (typeof showAuthOverlay === 'function') showAuthOverlay();
      setAMsg('Sign in or register to upgrade to Pro.');
      return;
    }
    if (!localStorage.getItem('lc_token')) {
      closeUpgrade();
      if (typeof showAuthOverlay === 'function') showAuthOverlay();
      return;
    }
    try {
      await startStripeCheckout();
    } catch (e) {
      notify(
        e.message === 'login_required' ? 'Please sign in first.' : 'Checkout failed. Try again later.',
        'error',
      );
    }
  };

  window.openStripePortal = async function () {
    if (typeof Auth !== 'undefined' && Auth.isGuest()) {
      switchTab('login');
      if (typeof showAuthOverlay === 'function') showAuthOverlay();
      setAMsg('Sign in to manage your subscription.');
      return;
    }
    if (!localStorage.getItem('lc_token')) {
      if (typeof showAuthOverlay === 'function') showAuthOverlay();
      return;
    }
    try {
      if (typeof startStripePortal !== 'function') throw new Error('portal_unavailable');
      await startStripePortal();
    } catch (e) {
      const msg =
        e.code === 'no_billing_account'
          ? 'No billing account found. Contact support if you subscribed with a different email.'
          : e.message === 'login_required'
            ? 'Please sign in first.'
            : 'Could not open billing portal. Try again later.';
      notify(msg, 'error', 6000);
    }
  };

  async function waitForProActivation(maxAttempts, delayMs) {
    maxAttempts = maxAttempts || 16;
    delayMs = delayMs || 500;
    for (let i = 0; i < maxAttempts; i++) {
      await Auth.bootstrap();
      if (isPro() && getQuotaMax() >= PRO_QUOTA) return true;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return isPro() && getQuotaMax() >= PRO_QUOTA;
  }

  window.handleUrlParams = async function () {
    const p = new URLSearchParams(location.search);
    if (p.get('upgraded') === '1') {
      const sessionId = p.get('session_id') || '';
      history.replaceState({}, '', location.pathname);
      let activated = false;
      if (sessionId && typeof confirmStripePurchase === 'function') {
        try {
          await confirmStripePurchase(sessionId);
          activated = true;
        } catch (e) {
          lcDebug.warn('[upgrade] stripe-confirm failed, falling back to webhook poll:', e.message || e);
        }
      }
      if (!activated) activated = await waitForProActivation();
      updUserBtn();
      updQuotaUI();
      if (typeof refreshUserDropdown === 'function') refreshUserDropdown();
      if (activated) {
        notify("You're now Pro — 12 exam generations/month plus personalized practice (€9.99/month).", 'success', 5000);
      } else {
        notify(
          'Payment received. Pro activation is still processing — refresh in a few seconds if needed.',
          'warn',
          6000,
        );
      }
    }
    if (p.get('cancelled') === '1') {
      history.replaceState({}, '', location.pathname);
      const el = document.getElementById('quotaHomeHint');
      if (el) el.textContent = 'Upgrade cancelled. You can upgrade anytime from the home screen.';
    }
    const resetToken = p.get('reset');
    if (resetToken) {
      history.replaceState({}, '', location.pathname);
      if (typeof showResetPasswordForm === 'function') showResetPasswordForm(resetToken);
    }
  };
})();
