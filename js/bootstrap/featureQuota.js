/* Client quota: server sync, UI, modals */
(function () {
  if (typeof S === 'undefined') return;

  S.plan = S.plan || 'guest';
  S.quotaUsed = S.quotaUsed || 0;
  S.quotaMax = S.quotaMax || GUEST_QUOTA;
  S.aiCreditsUsed = S.aiCreditsUsed || 0;
  S.aiCreditsMax = S.aiCreditsMax || 0;
  S.aiCreditsRemaining = S.aiCreditsRemaining ?? null;
  S.aiCreditsRollover = S.aiCreditsRollover || 0;
  S.aiCreditsTopups = S.aiCreditsTopups || 0;
  S.aiCreditsTotalPool = S.aiCreditsTotalPool || 0;
  S.autoRecharge = S.autoRecharge || { enabled: false, pack: 50, maxPerMonth: 2, usedThisMonth: 0 };
  S._aiCreditsWarned20 = false;
  S._aiCreditsWarned0 = false;

  window.canUsePersonalizedTier = function () {
    return S.plan === 'pro' ? 'pro' : 'free';
  };

  window.canUsePersonalized = function () {
    return S.plan === 'pro';
  };

  window.requirePersonalized = function (opts) {
    if (opts && opts.allowFreeStart) return true;
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
      aiUsed: user.aiCredits?.used,
      aiMax: user.aiCredits?.max,
      aiRemaining: user.aiCredits?.remaining,
      aiTotalPool: user.aiCredits?.totalPool,
      aiRollover: user.aiCredits?.rollover,
      aiTopups: user.aiCredits?.creditTopups,
      autoRecharge: user.aiCredits?.autoRecharge,
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
    if (typeof data.aiMax === 'number') S.aiCreditsMax = Math.max(0, data.aiMax);
    else if (S.plan === 'pro') S.aiCreditsMax = Number(window.AI_CREDITS_PRO || 100);
    else S.aiCreditsMax = 0;
    if (typeof data.aiUsed === 'number') {
      S.aiCreditsUsed = Math.max(0, data.aiUsed);
    }
    if (typeof data.aiRemaining === 'number') {
      S.aiCreditsRemaining = Math.max(0, data.aiRemaining);
    } else if (typeof data.aiUsed === 'number' && S.aiCreditsMax) {
      S.aiCreditsRemaining = Math.max(0, getAiCreditsTotalPool() - data.aiUsed);
    }
    if (typeof data.aiRollover === 'number') S.aiCreditsRollover = data.aiRollover;
    else if (typeof data.rollover === 'number') S.aiCreditsRollover = data.rollover;
    if (typeof data.aiTopups === 'number') S.aiCreditsTopups = data.aiTopups;
    else if (typeof data.creditTopups === 'number') S.aiCreditsTopups = data.creditTopups;
    if (typeof data.aiTotalPool === 'number') S.aiCreditsTotalPool = data.aiTotalPool;
    else S.aiCreditsTotalPool = getAiCreditsTotalPool();
    if (typeof S.aiCreditsRemaining === 'number' && S.aiCreditsTotalPool < S.aiCreditsRemaining) {
      S.aiCreditsTotalPool = S.aiCreditsRemaining;
    }
    if (data.autoRecharge && typeof data.autoRecharge === 'object') {
      S.autoRecharge = { ...S.autoRecharge, ...data.autoRecharge };
    }
    checkAiCreditsNotify();
    localStorage.setItem(
      'lc_quota',
      JSON.stringify({
        month: getMonthKey(),
        used: S.quotaUsed,
        max: S.quotaMax,
        plan: S.plan,
        aiUsed: S.aiCreditsUsed,
        aiMax: S.aiCreditsMax,
        aiRemaining: getAiCreditsRemaining(),
        aiRollover: S.aiCreditsRollover,
        aiTopups: S.aiCreditsTopups,
      }),
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

  window.getAiCreditsRemaining = function () {
    if (typeof S.aiCreditsRemaining === 'number') return Math.max(0, S.aiCreditsRemaining);
    const pool = getAiCreditsTotalPool();
    const used = typeof S.aiCreditsUsed === 'number' ? S.aiCreditsUsed : 0;
    return Math.max(0, pool - used);
  };

  window.getAiCreditsTotalPool = function () {
    if (S.aiCreditsTotalPool > 0) return S.aiCreditsTotalPool;
    const base = S.aiCreditsMax || (isPro() ? Number(window.AI_CREDITS_PRO || 100) : 0);
    return base + (S.aiCreditsRollover || 0) + (S.aiCreditsTopups || 0);
  };

  window.getAiCreditsMax = function () {
    return getAiCreditsTotalPool();
  };

  window.aiCreditsMeterLabel = function () {
    if (!isPro()) return '';
    const rem = getAiCreditsRemaining();
    const total = Math.max(getAiCreditsTotalPool(), rem);
    return `AI credits: ${rem}/${total} · renews ${aiCreditsRenewalLabel()}`;
  };

  window.checkAiCreditsNotify = function () {
    if (!isPro()) return;
    const rem = getAiCreditsRemaining();
    const total = getAiCreditsTotalPool();
    if (total <= 0) return;
    const pct = rem / total;
    if (rem === 0 && !S._aiCreditsWarned0) {
      S._aiCreditsWarned0 = true;
      if (typeof notify === 'function') {
        notify(`AI credits exhausted. Buy a pack or wait until ${aiCreditsRenewalLabel()}.`, 'warn', 8000);
      }
    } else if (pct <= 0.2 && pct > 0 && !S._aiCreditsWarned20) {
      S._aiCreditsWarned20 = true;
      if (typeof notify === 'function') {
        notify(`Low AI credits (${rem}/${total}). Consider a top-up pack.`, 'warn', 6000);
      }
    }
    if (rem > 0) S._aiCreditsWarned0 = false;
    if (pct > 0.2) S._aiCreditsWarned20 = false;
  };

  window.showCreditPackModal = function () {
    document.getElementById('creditPackModal')?.classList.add('show');
  };

  window.closeCreditPackModal = function () {
    document.getElementById('creditPackModal')?.classList.remove('show');
  };

  window.showAiCreditsExhausted = function (opts) {
    if (opts && opts.autoRechargeFailed) {
      const msg =
        opts.reason === 'authentication_required'
          ? 'Your bank requires confirmation for auto-recharge. Buy a pack manually below.'
          : 'Auto-recharge failed. Buy a credit pack to continue.';
      if (typeof notify === 'function') notify(msg, 'warn', 8000);
    }
    showCreditPackModal();
  };

  window.aiCreditsRenewalLabel = function () {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    d.setHours(0, 0, 0, 0);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  };

  window.canUseAiGeneration = function () {
    const minCost = Number(window.AI_COST_PERSONAL_EXAM || 3);
    return isPro() && getAiCreditsRemaining() >= minCost;
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
      const quotaNote = 'Official library exams use your monthly exam allowance. Personalized AI practice uses AI credits (3 per module). Failed generations are refunded automatically.';
      const aiLine = isPro() && getAiCreditsTotalPool() > 0 ? ` ${aiCreditsMeterLabel()}.` : '';
      if (isPro()) {
        homeHint.textContent = `${rem} / ${max} exams remaining this month (Pro).${aiLine} ${quotaNote}`;
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
    const aiEl = document.getElementById('aiCreditsIndicator');
    if (aiEl) {
      if (isPro() && getAiCreditsTotalPool() > 0) {
        aiEl.textContent = aiCreditsMeterLabel();
        aiEl.style.display = '';
      } else {
        aiEl.textContent = '';
        aiEl.style.display = 'none';
      }
    }
    const examAiEl = document.getElementById('examConfigAiCredits');
    if (examAiEl && isPro()) {
      examAiEl.textContent = aiCreditsMeterLabel();
      examAiEl.style.display = '';
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
