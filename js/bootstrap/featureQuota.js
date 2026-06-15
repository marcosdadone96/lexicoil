/* Client quota: server sync, UI, modals */
(function () {
  if (typeof S === 'undefined') return;

  S.plan = S.plan || 'guest';
  S.quotaUsed = S.quotaUsed || 0;
  S.quotaMax = S.quotaMax || GUEST_QUOTA;

  window.canUsePersonalized = function () {
    return S.plan === 'pro';
  };

  window.requirePersonalized = function (opts) {
    if (canUsePersonalized()) return true;
    const msg =
      (opts && opts.message) ||
      'Personalized practice (vocabulary exams, listening game, AI speaking) requires Pro. Standard exams from the library remain available on your plan.';
    if (typeof notify === 'function') notify(msg, 'warn', 6000);
    else if (typeof lcToast === 'function') lcToast(msg, 'warn', 6000);
    if (typeof showUpgrade === 'function') showUpgrade();
    return false;
  };

  window.quotaMaxForPlan = function (plan) {
    if (plan === 'pro') return PRO_QUOTA;
    if (plan === 'guest') return GUEST_QUOTA;
    return FREE_QUOTA;
  };

  window.applyUserFromServer = function (user) {
    if (!user) return;
    const plan = user.guest ? 'guest' : (user.pro || user.plan === 'pro') ? 'pro' : user.plan || 'free';
    const avatar = (user.name || user.email || '?')[0].toUpperCase();
    if (typeof saveUser === 'function') {
      saveUser({
        name: user.name || 'User',
        email: user.email,
        avatar,
        plan: plan === 'guest' ? 'free' : plan,
        memberSince: user.memberSince || null,
      });
    }
    applyServerQuota({
      used: user.quota?.used,
      max: user.quota?.max,
      plan,
    });
    if (typeof applyFreeCombo === 'function') applyFreeCombo(user);
  };

  window.applyServerQuota = function (data) {
    if (data.plan) {
      S.plan = data.plan === 'pro' ? 'pro' : data.plan === 'guest' ? 'guest' : data.plan || 'free';
      if (S.user) {
        S.user.plan = S.plan === 'pro' ? 'pro' : S.plan === 'guest' ? 'free' : S.plan;
        if (typeof saveUser === 'function') saveUser(S.user);
      }
    }
    if (S.plan === 'pro') S.quotaMax = PRO_QUOTA;
    else if (S.plan === 'guest') S.quotaMax = GUEST_QUOTA;
    else S.quotaMax = FREE_QUOTA;
    if (typeof data.used === 'number') {
      S.quotaUsed = Math.max(0, Math.min(data.used, S.quotaMax));
    }
    localStorage.setItem(
      'lc_quota',
      JSON.stringify({ month: getMonthKey(), used: S.quotaUsed, max: S.quotaMax, plan: S.plan }),
    );
    if (typeof updQuotaUI === 'function') updQuotaUI();
    if (typeof refreshUserDropdown === 'function') refreshUserDropdown();
  };

  window.getQuotaUsed = function () {
    if (typeof S.quotaUsed === 'number' && S.quotaUsed > 0) return S.quotaUsed;
    try {
      const raw = localStorage.getItem('lc_quota');
      if (!raw) return S.quotaUsed || 0;
      const q = JSON.parse(raw);
      return q.month === getMonthKey() ? (q.used || 0) : 0;
    } catch {
      return S.quotaUsed || 0;
    }
  };

  window.isPro = function () {
    return S.plan === 'pro';
  };

  window.getQuotaMax = function () {
    return S.quotaMax || quotaMaxForPlan(S.plan);
  };

  window.canGenerate = function () {
    return getQuotaUsed() < getQuotaMax();
  };

  window.incQuota = async function () {
    if (typeof commitExamQuota === 'function') {
      try {
        await commitExamQuota();
      } catch (e) {
        if (e.code === 'quota_exceeded') throw e;
      }
      return;
    }
    applyServerQuota({ used: getQuotaUsed() + 1, plan: S.plan });
    if (typeof Auth !== 'undefined') Auth.pushSync();
  };

  window.updQuotaUI = function () {
    const used = getQuotaUsed();
    const max = getQuotaMax();
    const rem = max - used;
    const el = document.getElementById('quotaCount');
    const badge = document.getElementById('planBadgeHome');
    const upgradeBtn = document.getElementById('upgradeBtnHome');
    const homeHint = document.getElementById('quotaHomeHint');
    const guest = typeof Auth !== 'undefined' && Auth.isGuest && Auth.isGuest();

    if (el) {
      el.textContent = guest ? `${used}/${max} guest tries` : `${used}/${max} used`;
      el.className = 'quota-count' + (rem === 0 ? ' none' : rem <= 1 ? ' low' : '');
    }
    if (badge) {
      const lbl =
        S.plan === 'pro'
          ? '<span class="plan-badge plan-pro">Pro</span>'
          : guest
            ? '<span class="plan-badge plan-free">Guest</span>'
            : '<span class="plan-badge plan-free">Free</span>';
      badge.innerHTML = lbl;
    }
    if (upgradeBtn) upgradeBtn.style.display = isPro() ? 'none' : 'inline-flex';

    if (homeHint) {
      const quotaNote = 'Each delivered exam counts — generated or reused from the pool.';
      if (isPro()) {
        homeHint.textContent = `${rem} / ${max} exams remaining this month (Pro). ${quotaNote}`;
      } else if (!canGenerate()) {
        homeHint.textContent =
          `You've used your ${max} exams this month. ${quotaNote} Upgrade to Pro for ${PRO_QUOTA}/month plus personalized vocabulary practice.`;
      } else {
        const comboHint =
          typeof isFreeAccount === 'function' && isFreeAccount() && typeof freeComboLabel === 'function'
            ? ` Free plan: ${freeComboLabel(getFreeCombo())} only.`
            : '';
        homeHint.textContent = guest
          ? `${rem} guest exam${rem === 1 ? '' : 's'} left. Register free for ${FREE_QUOTA} official mocks/month.${comboHint}`
          : `${rem} / ${max} official mocks remaining this month.${comboHint} Personalized practice is Pro-only. Retakes of saved exams are free.`;
      }
    }
  };

  window.showQuotaExceededModal = function (err) {
    const used = err?.used ?? getQuotaUsed();
    const max = err?.max ?? getQuotaMax();
    const plan = err?.plan || S.plan;
    const msg = document.getElementById('quotaExceededMsg');
    if (msg) {
      msg.innerHTML =
        plan === 'guest'
          ? `You've used all <b>${max}</b> guest exam generations on this device.<br>Register free for <b>${FREE_QUOTA}</b> standard exams/month synced across devices.`
          : plan === 'pro'
            ? `You've used <b>${used}/${max}</b> Pro exam generations this month.<br>Retake a saved exam without using quota, or wait until next month.`
            : `You've used <b>${used}/${max}</b> official mocks this month.<br>Upgrade to Pro for all languages & levels plus personalized practice, or retake a saved exam without using quota.`;
    }
    document.getElementById('quotaExceededModal')?.classList.add('show');
  };

  window.closeQuotaExceeded = function () {
    document.getElementById('quotaExceededModal')?.classList.remove('show');
  };
})();
