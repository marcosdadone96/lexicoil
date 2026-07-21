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
  S.autoRecharge = S.autoRecharge || { enabled: false, pack: 40, maxPerMonth: 2, usedThisMonth: 0 };
  S._aiCreditsWarned20 = false;
  S._aiCreditsWarned0 = false;
  S.aiTrialActive = S.aiTrialActive ?? null;

  const PRO_ONLY_ACTIONS = new Set(['personal_exam', 'grammar_coaching', 'speaking_realtime']);

  window.resolveAppPlan = function () {
    if (typeof Auth !== 'undefined' && Auth.isGuest && Auth.isGuest()) return 'guest';
    const candidates = [];
    if (S.plan) candidates.push(String(S.plan).toLowerCase());
    if (S.user?.plan) candidates.push(String(S.user.plan).toLowerCase());
    if (S.user?.pro) candidates.push('pro');
    try {
      const q = JSON.parse(localStorage.getItem('lc_quota') || '{}');
      if (q.plan) candidates.push(String(q.plan).toLowerCase());
    } catch (_) {}
    for (const p of candidates) {
      if (p === 'pro_max') return 'pro_max';
      if (p === 'pro') return 'pro';
    }
    for (const p of candidates) {
      if (p === 'guest') return 'guest';
    }
    return 'free';
  };

  window.syncAppPlan = function () {
    const resolved = resolveAppPlan();
    S.plan = resolved;
    if (S.user && resolved !== 'guest') {
      S.user.plan = resolved;
    }
    return resolved;
  };

  window.isPaidPlan = function () {
    const p = resolveAppPlan();
    return p === 'pro' || p === 'pro_max';
  };

  window.isProMax = function () {
    return S.plan === 'pro_max';
  };

  window.isPro = function () {
    return isPaidPlan();
  };

  window.isFreeAiTrial = function () {
    if (isPaidPlan() || S.plan === 'guest') return false;
    if (S.aiTrialActive === true) return true;
    if (S.aiTrialActive === false) return false;
    if (!S.user?.memberSince) return false;
    const d = new Date(S.user.memberSince);
    if (Number.isNaN(d.getTime())) return false;
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return m === getMonthKey();
  };

  window.aiActionCost = function (action) {
    const costs = {
      personal_exam: Number(window.AI_COST_PERSONAL_EXAM || 3),
      vocab_quiz: Number(window.AI_COST_VOCAB_QUIZ || 2),
      speaking: Number(window.AI_COST_SPEAKING || 2),
      speaking_realtime: Number(window.AI_COST_SPEAKING_REALTIME || 4),
      writing_correction: Number(window.AI_COST_WRITING || 1),
      listening_game: Number(window.AI_COST_LISTENING_GAME || 1),
      grammar_coaching: 1,
      tts: 1,
    };
    return costs[action] ?? 0;
  };

  window.canAccessProOnlyAction = function () {
    return isPaidPlan();
  };

  window.hasAiCreditsFor = function (action) {
    if (S.plan === 'guest') return false;
    if (PRO_ONLY_ACTIONS.has(action) && !isPaidPlan()) return false;
    const cost = aiActionCost(action);
    return cost > 0 && getAiCreditsRemaining() >= cost;
  };

  window.requireProOnlyAction = function (action, opts) {
    if (canAccessProOnlyAction()) return true;
    const label =
      action === 'grammar_coaching'
        ? 'Grammar coaching'
        : action === 'speaking_realtime'
          ? 'Live speaking partner'
          : 'Personalized exams';
    const msg =
      (opts && opts.message) ||
      `${label} requires Pro. Upgrade for full AI practice and unlimited pool access.`;
    if (typeof notify === 'function') notify(msg, 'warn', 6000);
    else if (typeof lcToast === 'function') lcToast(msg, 'warn', 6000);
    if (typeof showUpgrade === 'function') showUpgrade();
    return false;
  };

  window.requireAiCredits = function (action, opts) {
    if (S.plan === 'guest') {
      const msg = (opts && opts.message) || 'Sign in free to use AI practice with monthly credits.';
      if (typeof notify === 'function') notify(msg, 'warn', 6000);
      else if (typeof lcToast === 'function') lcToast(msg, 'warn', 6000);
      if (typeof showLogin === 'function') showLogin();
      return false;
    }
    if (PRO_ONLY_ACTIONS.has(action)) {
      return requireProOnlyAction(action, opts);
    }
    const cost = aiActionCost(action);
    if (getAiCreditsRemaining() >= cost) return true;
    const rem = getAiCreditsRemaining();
    const renew =
      typeof aiCreditsRenewalLabel === 'function' ? aiCreditsRenewalLabel() : 'next month';
    let msg;
    if (isPaidPlan()) {
      msg =
        rem === 0
          ? `You have used all your AI credits this month. Buy a pack below (15, 40 or 100 credits) or wait until ${renew}.`
          : `You need ${cost} credit${cost === 1 ? '' : 's'} but only ${rem} remain. Buy a credit pack below or wait until ${renew}.`;
      if (typeof notify === 'function') notify(msg, 'warn', 7000);
      else if (typeof lcToast === 'function') lcToast(msg, 'warn', 7000);
      S._upgradeModalReason = 'credits';
      if (typeof showUpgrade === 'function') showUpgrade();
      S._upgradeModalReason = null;
      return false;
    }
    msg =
      rem === 0
        ? 'You have used all your AI credits this month. Upgrade to Pro for more AI practice.'
        : `You need ${cost} credit${cost === 1 ? '' : 's'} but only ${rem} remain this month. Upgrade to Pro for more.`;
    if (typeof notify === 'function') notify(msg, 'warn', 7000);
    else if (typeof lcToast === 'function') lcToast(msg, 'warn', 7000);
    if (typeof showUpgrade === 'function') showUpgrade();
    return false;
  };

  window.canUsePersonalizedTier = function () {
    if (isPaidPlan()) return S.plan === 'pro_max' ? 'pro_max' : 'pro';
    if (S.plan === 'free' && getAiCreditsRemaining() > 0) return 'free';
    return 'free';
  };

  window.canUsePersonalized = function () {
    return isPaidPlan() && hasAiCreditsFor('personal_exam');
  };

  window.requirePersonalized = function (opts) {
    const action = (opts && opts.action) || 'personal_exam';
    if (opts && opts.allowFreeStart) return true;
    if (PRO_ONLY_ACTIONS.has(action)) {
      return requireProOnlyAction(action, opts);
    }
    return requireAiCredits(action, opts);
  };

  window.canUseWritingCorrection = function () {
    return S.plan !== 'guest' && hasAiCreditsFor('writing_correction');
  };

  window.canUseVocabQuizAi = function () {
    return S.plan !== 'guest' && hasAiCreditsFor('vocab_quiz');
  };

  window.canUseSpeakingAi = function () {
    return S.plan !== 'guest' && hasAiCreditsFor('speaking');
  };

  window.canUseListeningGame = function () {
    return S.plan !== 'guest' && hasAiCreditsFor('listening_game');
  };

  window.poolPreviewLimit = function (lang, level) {
    const subject = lang ?? (typeof S !== 'undefined' ? S.subject : null);
    const lv = level ?? (typeof S !== 'undefined' ? S.level : null);
    if (subject && lv && typeof LevelAvailability !== 'undefined') {
      const fromManifest = LevelAvailability.poolPreviewLimitFor(subject, lv);
      if (fromManifest != null) return fromManifest;
    }
    return Number(window.FREE_POOL_PREVIEW || 2);
  };

  window.poolExamsThisMonth = function () {
    const month = getMonthKey();
    return (S.history || []).filter((h) => {
      if (!h.poolId) return false;
      const d = h.date ? new Date(h.date) : null;
      if (!d || Number.isNaN(d.getTime())) return true;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month;
    }).length;
  };

  window.curatedStandardExamsThisMonth = function (lang, level) {
    const month = getMonthKey();
    return (S.history || []).filter((h) => {
      if (h.lang !== lang || h.level !== level) return false;
      if (h.demo || h.guidedDemo) return false;
      const d = h.date ? new Date(h.date) : null;
      if (d && !Number.isNaN(d.getTime())) {
        const hm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (hm !== month) return false;
      }
      return h.examSource === 'library' || (!h.poolId && !h.vocabPersonal);
    }).length;
  };

  window.canStartStandardExam = function (lang, level) {
    if (isPaidPlan()) return true;
    const subject = lang ?? S.subject;
    const lv = level ?? S.level;
    if (
      subject &&
      lv &&
      typeof LevelAvailability !== 'undefined' &&
      typeof LevelAvailability.isCuratedOnlyLevel === 'function' &&
      LevelAvailability.isCuratedOnlyLevel(subject, lv)
    ) {
      const limit = LevelAvailability.poolPreviewLimitFor(subject, lv);
      if (limit != null) {
        return curatedStandardExamsThisMonth(subject, lv) < limit;
      }
      return true;
    }
    return getQuotaUsed() < getQuotaMax();
  };

  window.canUsePoolExam = function (lang, level) {
    if (isPaidPlan()) return true;
    if (S.plan === 'guest') return false;
    return poolExamsThisMonth() < poolPreviewLimit(lang, level);
  };

  window.quotaMaxForPlan = function (plan) {
    if (plan === 'pro' || plan === 'pro_max') return PRO_QUOTA;
    if (plan === 'guest') return GUEST_QUOTA;
    return FREE_QUOTA;
  };

  window.applyUserFromServer = function (user) {
    if (!user) return;
    const plan = user.guest
      ? 'guest'
      : user.plan === 'pro_max'
        ? 'pro_max'
        : user.pro || user.plan === 'pro'
          ? 'pro'
          : user.plan || 'free';
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
      aiTrialActive: user.aiCredits?.trialActive,
    });
    if (typeof applyFreeCombo === 'function') applyFreeCombo(user);
  };

  window.applyServerQuota = function (data) {
    if (data.plan) {
      S.plan =
        data.plan === 'pro_max'
          ? 'pro_max'
          : data.plan === 'pro'
            ? 'pro'
            : data.plan === 'guest'
              ? 'guest'
              : data.plan || 'free';
      if (S.user) {
        S.user.plan = S.plan === 'guest' ? 'free' : S.plan;
        S.user.pro = isPaidPlan();
        if (typeof saveUser === 'function') saveUser(S.user);
      }
    } else if (typeof syncAppPlan === 'function') {
      syncAppPlan();
    }
    if (isPaidPlan()) S.quotaMax = PRO_QUOTA;
    else if (S.plan === 'guest') S.quotaMax = GUEST_QUOTA;
    else S.quotaMax = FREE_QUOTA;
    if (typeof data.used === 'number') {
      S.quotaUsed = Math.max(0, Math.min(data.used, S.quotaMax));
    }
    if (typeof data.aiTrialActive === 'boolean') S.aiTrialActive = data.aiTrialActive;
    if (typeof data.aiMax === 'number') S.aiCreditsMax = Math.max(0, data.aiMax);
    else if (S.plan === 'pro_max') S.aiCreditsMax = Number(window.AI_CREDITS_PRO_MAX || 150);
    else if (S.plan === 'pro') S.aiCreditsMax = Number(window.AI_CREDITS_PRO || 40);
    else if (S.plan === 'free') S.aiCreditsMax = Number(window.AI_CREDITS_FREE || 6);
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
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('lc:plan-changed', { detail: { plan: resolveAppPlan() } }));
      } catch (_) {}
    }
  };

  window.getQuotaUsed = function () {
    if (typeof S.quotaUsed === 'number' && S.quotaUsed > 0) return S.quotaUsed;
    try {
      const raw = localStorage.getItem('lc_quota');
      if (!raw) return S.quotaUsed || 0;
      const q = JSON.parse(raw);
      return q.month === getMonthKey() ? q.used || 0 : 0;
    } catch {
      return S.quotaUsed || 0;
    }
  };

  window.getAiCreditsRemaining = function () {
    const pool = getAiCreditsTotalPool();
    const used = typeof S.aiCreditsUsed === 'number' ? S.aiCreditsUsed : 0;
    const derived = Math.max(0, pool - used);
    if (typeof S.aiCreditsRemaining === 'number') {
      if (S.plan !== 'guest' && pool > 0 && S.aiCreditsRemaining === 0 && derived > 0) {
        return derived;
      }
      return Math.max(0, S.aiCreditsRemaining);
    }
    return derived;
  };

  window.getAiCreditsTotalPool = function () {
    if (S.aiCreditsTotalPool > 0) return S.aiCreditsTotalPool;
    let base = S.aiCreditsMax || 0;
    if (!base) {
      if (S.plan === 'pro_max') base = Number(window.AI_CREDITS_PRO_MAX || 150);
      else if (S.plan === 'pro') base = Number(window.AI_CREDITS_PRO || 40);
      else if (S.plan === 'free') base = Number(window.AI_CREDITS_FREE || 6);
    }
    return base + (S.aiCreditsRollover || 0) + (S.aiCreditsTopups || 0);
  };

  window.getAiCreditsMax = function () {
    return getAiCreditsTotalPool();
  };

  window.aiCreditsMeterLabel = function () {
    if (S.plan === 'guest') return '';
    const rem = getAiCreditsRemaining();
    const total = Math.max(getAiCreditsTotalPool(), rem);
    if (total <= 0 && rem <= 0) return '';
    return `${rem} AI credit${rem === 1 ? '' : 's'} left this month · renews ${aiCreditsRenewalLabel()}`;
  };

  window.checkAiCreditsNotify = function () {
    if (S.plan === 'guest') return;
    const rem = getAiCreditsRemaining();
    const total = getAiCreditsTotalPool();
    if (total <= 0) return;
    const pct = rem / total;
    if (rem === 0 && !S._aiCreditsWarned0) {
      S._aiCreditsWarned0 = true;
      const waitMsg = isPaidPlan()
        ? `AI credits exhausted. Buy a pack or wait until ${aiCreditsRenewalLabel()}.`
        : 'AI credits used up. Upgrade to Pro for unlimited AI practice.';
      if (typeof notify === 'function') notify(waitMsg, 'warn', 8000);
    } else if (pct <= 0.2 && pct > 0 && !S._aiCreditsWarned20) {
      S._aiCreditsWarned20 = true;
      if (typeof notify === 'function') {
        notify(`Low AI credits (${rem}/${total}).`, 'warn', 6000);
      }
    }
    if (rem > 0) S._aiCreditsWarned0 = false;
    if (pct > 0.2) S._aiCreditsWarned20 = false;
  };

  window.showCreditPackModal = function (opts) {
    if (typeof renderCreditPackWall === 'function') renderCreditPackWall(opts || { mode: 'browse' });
    document.getElementById('creditPackModal')?.classList.add('show');
  };

  window.closeCreditPackModal = function () {
    document.getElementById('creditPackModal')?.classList.remove('show');
  };

  function creditPackEsc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPackEur(amount) {
    if (typeof PlanPricing !== 'undefined' && PlanPricing.formatEur) return PlanPricing.formatEur(amount);
    return `€${Number(amount).toFixed(2)}`;
  }

  function creditPackOffers() {
    return Array.isArray(window.CREDIT_PACK_OFFERS) ? window.CREDIT_PACK_OFFERS : [];
  }

  window.exhaustedWallActionsForPlan = function (plan) {
    const p = String(plan || S.plan || 'guest').toLowerCase();
    if (p === 'free' || p === 'guest') {
      return { primary: 'upgrade_pro', showPacks: false, showAutoRecharge: false };
    }
    if (p === 'pro') {
      return { primary: 'upgrade_pro_max', showPacks: true, showAutoRecharge: true };
    }
    if (p === 'pro_max') {
      return { primary: 'buy_pack', showPacks: true, showAutoRecharge: true };
    }
    return { primary: 'upgrade_pro', showPacks: false, showAutoRecharge: false };
  };

  window.renderCreditPackWall = function (opts) {
    opts = opts || {};
    const mode = opts.mode || 'exhausted';
    const wall = exhaustedWallActionsForPlan(S.plan);
    const titleEl = document.getElementById('creditPackModalTitle');
    const subEl = document.getElementById('creditPackModalSubtitle');
    const primaryEl = document.getElementById('creditPackPrimaryCta');
    const dividerEl = document.getElementById('creditPackDivider');
    const offersEl = document.getElementById('creditPackOffers');
    const autoEl = document.getElementById('creditPackAutoRecharge');
    const autoLabel = document.getElementById('autoRechargeLabel');
    if (!titleEl || !offersEl) return;

    const proMaxCredits = Number(window.AI_CREDITS_PRO_MAX || 150);
    const proMaxEur = Number(window.PRO_MAX_SUBSCRIPTION_EUR || 24);
    const proEur = Number(window.PRO_SUBSCRIPTION_EUR || 13);
    const renew =
      typeof aiCreditsRenewalLabel === 'function' ? aiCreditsRenewalLabel() : 'next month';

    if (mode === 'exhausted') {
      titleEl.textContent = 'AI credits exhausted';
      subEl.textContent =
        wall.primary === 'buy_pack'
          ? 'Buy a credit pack to continue. Pack credits never expire.'
          : `Monthly credits renew on ${renew}. Upgrade for a larger monthly pool, or buy packs that never expire.`;
    } else {
      titleEl.textContent = 'AI credit packs';
      subEl.textContent = `Monthly credits renew on ${renew}. Pack credits never expire.`;
    }

    primaryEl.innerHTML = '';
    if (wall.primary === 'upgrade_pro') {
      primaryEl.innerHTML = `<button type="button" class="btn-upgrade credit-pack-primary" onclick="closeCreditPackModal();showUpgrade();">Upgrade to Pro — ${formatPackEur(proEur)}/month</button>`;
    } else if (wall.primary === 'upgrade_pro_max') {
      primaryEl.innerHTML = `<button type="button" class="btn-upgrade credit-pack-primary" onclick="closeCreditPackModal();activateProMax();">Upgrade to Pro Max — ${proMaxCredits}/month · ${formatPackEur(proMaxEur)}/month</button>`;
    }

    offersEl.innerHTML = '';
    if (wall.showPacks) {
      if (dividerEl) dividerEl.hidden = wall.primary !== 'upgrade_pro_max';
      const offers = creditPackOffers();
      const esc =
        typeof PlanPricing !== 'undefined' && PlanPricing.creditPackEsc
          ? PlanPricing.creditPackEsc
          : creditPackEsc;
      offersEl.innerHTML = offers
        .map((o, i) => {
          const best = o.pack === 40 ? ' ⭐ Best value' : '';
          return `<button type="button" class="plan-card credit-pack-offer${i === 1 ? ' pro-card' : ''}" onclick="startCreditCheckout(${o.pack})">
            <div class="credit-pack-offer__head">
              <div class="plan-card-label">${o.credits} credits${best}</div>
              <span class="credit-pack-badge">Never expire</span>
            </div>
            <div class="plan-price">${formatPackEur(o.priceEur)}</div>
            <div class="credit-pack-offer__meta">${formatPackEur(o.pricePerCredit)}/credit · one-off</div>
          </button>`;
        })
        .join('');
    } else {
      if (dividerEl) dividerEl.hidden = true;
    }

    const mPack = creditPackOffers().find((o) => o.pack === 40) || { credits: 40, priceEur: 14 };
    if (autoLabel) {
      autoLabel.textContent = `Auto-recharge ${mPack.credits} credits (${formatPackEur(mPack.priceEur)}) when I run out — max 2/month (off by default)`;
    }
    if (autoEl) autoEl.hidden = !wall.showAutoRecharge;
    if (wall.showAutoRecharge && typeof loadAutoRechargePref === 'function') loadAutoRechargePref();
  };

  window.showAiCreditsExhausted = function (opts) {
    if (opts && opts.autoRechargeFailed) {
      const msg =
        opts.reason === 'authentication_required'
          ? 'Your bank requires confirmation for auto-recharge. Buy a pack manually below.'
          : 'Auto-recharge failed. Buy a credit pack to continue.';
      if (typeof notify === 'function') notify(msg, 'warn', 8000);
    }
    const wall = exhaustedWallActionsForPlan(S.plan);
    if (wall.primary === 'upgrade_pro') {
      if (typeof notify === 'function') {
        const proCredits = typeof PlanPricing !== 'undefined' ? PlanPricing.aiCreditsPro : Number(window.AI_CREDITS_PRO || 40);
        notify(`Upgrade to Pro for full AI practice and ${proCredits} credits/month.`, 'warn', 7000);
      }
      if (typeof showUpgrade === 'function') showUpgrade();
      return;
    }
    showCreditPackModal({ mode: 'exhausted' });
  };

  window.aiCreditsBreakdownLabel = function () {
    if (S.plan === 'guest') return '';
    const monthlyLeft = Math.max(0, (S.aiCreditsMax || 0) - (S.aiCreditsUsed || 0));
    const rollover = S.aiCreditsRollover || 0;
    const topups = S.aiCreditsTopups || 0;
    if (monthlyLeft === 0 && rollover === 0 && topups === 0) return '';
    const parts = [];
    if (monthlyLeft > 0) {
      parts.push(`${monthlyLeft} monthly (resets ${aiCreditsRenewalLabel()})`);
    }
    if (rollover > 0) parts.push(`${rollover} rollover`);
    if (topups > 0) parts.push(`${topups} packs (never expire)`);
    return parts.join(' · ');
  };

  window.aiCreditsRenewalLabel = function () {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    d.setHours(0, 0, 0, 0);
    return typeof formatAppDate === 'function'
      ? formatAppDate(d)
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  window.examsRemainingLabel = function () {
    const rem = Math.max(0, getQuotaMax() - getQuotaUsed());
    const max = getQuotaMax();
    return `${rem}/${max} exams this month`;
  };

  window.aiCreditsSummaryLabel = function () {
    if (S.plan === 'guest') return '';
    const rem = getAiCreditsRemaining();
    const total = Math.max(getAiCreditsTotalPool(), rem);
    if (total <= 0 && rem <= 0) return '';
    const breakdown = aiCreditsBreakdownLabel();
    if (breakdown) return `AI credits ${rem}/${total} (${breakdown})`;
    return `AI credits ${rem}/${total}`;
  };

  window.canUseAiGeneration = function () {
    return canUsePersonalized();
  };

  window.vocabQuizCreditCost = function () {
    return aiActionCost('vocab_quiz');
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
    if (typeof syncAppPlan === 'function') syncAppPlan();
    const plan = typeof resolveAppPlan === 'function' ? resolveAppPlan() : S.plan || 'guest';
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
        plan === 'pro_max'
          ? '<span class="plan-badge plan-pro">Pro Max</span>'
          : plan === 'pro'
            ? '<span class="plan-badge plan-pro">Pro</span>'
            : guest
              ? '<span class="plan-badge plan-free">Guest</span>'
              : '<span class="plan-badge plan-free">Free</span>';
      badge.innerHTML = lbl;
    }
    if (upgradeBtn) upgradeBtn.style.display = isPaidPlan() ? 'none' : 'inline-flex';

    if (homeHint) {
      const quotaNote =
        'Official library exams use your monthly exam allowance. AI practice uses credits (speaking 2, quiz 2, writing 1).';
      const aiLine = S.plan !== 'guest' && getAiCreditsTotalPool() > 0 ? ` ${aiCreditsMeterLabel()}.` : '';
      if (isPaidPlan()) {
        homeHint.textContent = `${rem} / ${max} exams remaining this month (${S.plan === 'pro_max' ? 'Pro Max' : 'Pro'}).${aiLine} ${quotaNote}`;
      } else if (!canGenerate()) {
        homeHint.textContent = `You've used your ${max} exams this month.${aiLine} Upgrade to Pro for ${PRO_QUOTA}/month plus full pool access.`;
      } else {
        const poolHint = !canUsePoolExam(S.subject, S.level)
          ? ` Pool preview limit reached (${poolPreviewLimit(S.subject, S.level)} exams).`
          : ` Free includes ${poolPreviewLimit(S.subject, S.level)} pool exams/month as a preview.`;
        homeHint.textContent = guest
          ? `${rem} guest exam${rem === 1 ? '' : 's'} left. Register free for ${FREE_QUOTA} official mocks/month and ${Number(window.AI_CREDITS_FREE || 6)} AI credits.`
          : `${rem} / ${max} official mocks remaining.${aiLine}${poolHint} Personalized exams and grammar coaching require Pro.`;
      }
    }
    const aiEl = document.getElementById('aiCreditsIndicator');
    if (aiEl) {
      if (S.plan !== 'guest' && getAiCreditsTotalPool() > 0) {
        aiEl.textContent = aiCreditsMeterLabel();
        aiEl.style.display = '';
      } else {
        aiEl.textContent = '';
        aiEl.style.display = 'none';
      }
    }
    const examAiEl = document.getElementById('examConfigAiCredits');
    if (examAiEl && S.plan !== 'guest') {
      examAiEl.textContent = aiCreditsMeterLabel();
      examAiEl.style.display = getAiCreditsTotalPool() > 0 ? '' : 'none';
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
          : plan === 'pro' || plan === 'pro_max'
            ? `You've used <b>${used}/${max}</b> exam generations this month.<br>Retake a saved exam without using quota, or wait until next month.`
            : `You've used <b>${used}/${max}</b> official mocks this month.<br>Upgrade to Pro for all languages & levels plus full pool access, or retake a saved exam without using quota.`;
    }
    document.getElementById('quotaExceededModal')?.classList.add('show');
  };

  window.closeQuotaExceeded = function () {
    document.getElementById('quotaExceededModal')?.classList.remove('show');
  };

  if (S.user?.plan || localStorage.getItem('lc_quota')) {
    syncAppPlan();
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('lc:plan-changed', () => {
      if (typeof refreshUserDropdown === 'function') refreshUserDropdown();
    });
  }
})();
