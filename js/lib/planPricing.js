/** Central front-end pricing copy — reads window.* set in state.js (load after state.js). */

(function () {

  function num(key, fallback) {

    const v = typeof window !== 'undefined' ? window[key] : undefined;

    const n = Number(v);

    return Number.isFinite(n) ? n : fallback;

  }



  function packOffers() {

    return Array.isArray(window.CREDIT_PACK_OFFERS) ? window.CREDIT_PACK_OFFERS.slice() : [];

  }



  function minPackPriceEur() {

    const offers = packOffers();

    if (!offers.length) return 6;

    return Math.min(...offers.map((o) => Number(o.priceEur)));

  }



  function mediumPack() {

    const offers = packOffers();

    return offers.find((o) => o.label === 'M') || offers[1] || offers[0] || null;

  }



  function formatEur(amount) {

    const n = Number(amount);

    if (!Number.isFinite(n)) return '€—';

    if (Math.abs(n - Math.round(n)) < 1e-9) return `€${Math.round(n)}`;

    return `€${n.toFixed(2)}`;

  }



  function currentPlan() {

    if (typeof resolveAppPlan === 'function') return resolveAppPlan();

    if (typeof S !== 'undefined' && S.plan) return S.plan;

    return 'free';

  }



  function setBtnVisible(el, visible) {

    if (!el) return;

    el.hidden = !visible;

    el.style.display = visible ? '' : 'none';

  }



  const PlanPricing = {

    get freeExamsPerMonth() {

      return num('FREE_QUOTA', 5);

    },

    get proExamsPerMonth() {

      return num('PRO_QUOTA', 12);

    },

    get aiCreditsFree() {

      return num('AI_CREDITS_FREE', 6);

    },

    get aiCreditsPro() {

      return num('AI_CREDITS_PRO', 40);

    },

    get aiCreditsProMax() {

      return num('AI_CREDITS_PRO_MAX', 150);

    },

    get proSubscriptionEur() {

      return num('PRO_SUBSCRIPTION_EUR', 13);

    },

    get proMaxSubscriptionEur() {

      return num('PRO_MAX_SUBSCRIPTION_EUR', 24);

    },

    get proRolloverMax() {

      return num('AI_CREDITS_PRO_ROLLOVER_MAX', 50);

    },

    packOffers,

    minPackPriceEur,

    mediumPack,

    formatEur,



    creditPackEsc(s) {

      return String(s ?? '')

        .replace(/&/g, '&amp;')

        .replace(/</g, '&lt;')

        .replace(/>/g, '&gt;')

        .replace(/"/g, '&quot;');

    },



    creditPackOffersHtml(opts = {}) {

      const offers = packOffers();

      const row = opts.row !== false;

      const cls = row ? 'credit-pack-offers credit-pack-offers--row' : 'credit-pack-offers';

      const esc = PlanPricing.creditPackEsc;

      const fmt = PlanPricing.formatEur;

      return offers

        .map((o, i) => {

          const best = o.pack === 40 ? ' ⭐' : '';

          return (

            `<button type="button" class="plan-card credit-pack-offer${i === 1 ? ' pro-card' : ''}" onclick="startCreditCheckout(${o.pack})">` +

            `<div class="credit-pack-offer__head">` +

            `<div class="plan-card-label">${o.credits} credits${best}</div>` +

            `<span class="credit-pack-badge">Never expire</span>` +

            `</div>` +

            `<div class="plan-price">${fmt(o.priceEur)}</div>` +

            `<div class="credit-pack-offer__meta">${fmt(o.pricePerCredit)}/credit</div>` +

            `</button>`

          );

        })

        .join('');

    },



    renderUpgradeCreditPacks(plan, reason) {

      const section = document.getElementById('upgradeCreditPacksSection');

      const offersEl = document.getElementById('upgradeCreditPackOffers');

      const heading = document.getElementById('upgradeCreditPacksHeading');

      const note = document.getElementById('upgradeCreditPacksNote');

      if (!section || !offersEl) return;

      const pl = plan || currentPlan();

      const isPaid = pl === 'pro' || pl === 'pro_max';

      if (!isPaid) {

        section.hidden = true;

        return;

      }

      section.hidden = false;

      if (heading) {

        heading.textContent =

          reason === 'credits'

            ? 'Buy one-off credit packs to continue'

            : 'Or buy one-off credit packs';

      }

      offersEl.innerHTML = PlanPricing.creditPackOffersHtml({ row: true });

      if (note) {

        note.textContent =

          '15 · 40 · 100 credits · one-off via Stripe · never expire (independent of your monthly plan)';

      }

    },



    upgradeIntroHtml(plan) {

      const p = PlanPricing;

      const pl = plan || currentPlan();

      if (pl === 'pro_max') {

        return `You're on <b>Pro Max</b> — ${p.proExamsPerMonth} exam generations/month and <b>${p.aiCreditsProMax} AI credits/month</b>. Need more? Buy credit packs from <b>${p.formatEur(p.minPackPriceEur())}</b>.`;

      }

      if (pl === 'pro') {

        return `You're on <b>Pro</b>. Upgrade to <b>Pro Max</b> for <b>${p.aiCreditsProMax} AI credits/month</b> (${p.formatEur(p.proMaxSubscriptionEur)}/month), or buy credit packs from <b>${p.formatEur(p.minPackPriceEur())}</b>.`;

      }

      return (

        `Free account: <b>${p.freeExamsPerMonth}</b> official mock exams per month on one certification (Goethe, Cambridge, or DELE). Pro: <b>${p.proExamsPerMonth}</b> generations/month, all languages & levels, plus <b>${p.aiCreditsPro} AI credits/month</b> (roll over up to ${p.proRolloverMax} unused). Pro Max: <b>${p.aiCreditsProMax} AI credits/month</b>. Packs from <b>${p.formatEur(p.minPackPriceEur())}</b>.`

      );

    },



    proActivatedToast() {

      const p = PlanPricing;

      return (

        `You're now Pro — ${p.proExamsPerMonth} exam generations/month, ${p.aiCreditsPro} AI credits/month (roll over up to ${p.proRolloverMax}), packs from ${p.formatEur(p.minPackPriceEur())} (${p.formatEur(p.proSubscriptionEur)}/month).`

      );

    },



    renderUpgradeModal() {

      if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;

      if (typeof syncAppPlan === 'function') syncAppPlan();

      const p = PlanPricing;

      const plan = currentPlan();

      const isPro = plan === 'pro' || plan === 'pro_max';

      const isProMax = plan === 'pro_max';

      const reason =

        typeof S !== 'undefined' && S._upgradeModalReason === 'credits' ? 'credits' : null;



      const title = document.getElementById('upgradeModalTitle');

      if (title) {

        if (reason === 'credits' && isPro) {

          title.innerHTML = 'Need more <em>AI credits</em>?';

        } else if (isProMax) title.innerHTML = 'Your plan: <em>Pro Max</em>';

        else if (isPro) title.innerHTML = 'Upgrade to <em>Pro Max</em>';

        else title.innerHTML = 'Upgrade to <em>Pro</em>';

      }



      const intro = document.getElementById('upgradeModalIntro');

      if (intro) intro.innerHTML = p.upgradeIntroHtml(plan);



      const note = document.getElementById('upgradeModalNote');

      if (note) note.hidden = isPro;



      const freeExams = document.getElementById('upgradeFreeExams');

      if (freeExams) freeExams.textContent = String(p.freeExamsPerMonth);



      const proPrice = document.getElementById('upgradeProPrice');

      if (proPrice) proPrice.innerHTML = `${p.formatEur(p.proSubscriptionEur)} <span>/ month</span>`;



      const proFeatures = document.getElementById('upgradeProFeatures');

      if (proFeatures) {

        proFeatures.innerHTML =

          `<b>${p.proExamsPerMonth}</b> exams / month<br>` +

          `<b>${p.aiCreditsPro}</b> AI credits / month<br>` +

          `Roll over up to ${p.proRolloverMax} unused<br>` +

          `Credit packs from ${p.formatEur(p.minPackPriceEur())}<br>` +

          `Personalized vocab exams<br>` +

          `Listening game &amp; AI speaking<br>` +

          `PDF reports<br>` +

          `Priority AI speed`;

      }



      const proMaxPrice = document.getElementById('upgradeProMaxPrice');

      if (proMaxPrice) proMaxPrice.innerHTML = `${p.formatEur(p.proMaxSubscriptionEur)} <span>/ month</span>`;



      const proMaxFeatures = document.getElementById('upgradeProMaxFeatures');

      if (proMaxFeatures) {

        proMaxFeatures.innerHTML =

          `Everything in Pro<br>` +

          `<b>${p.aiCreditsProMax}</b> AI credits / month<br>` +

          `Best for heavy AI practice<br>` +

          `Credit packs from ${p.formatEur(p.minPackPriceEur())}<br>` +

          `Priority AI speed`;

      }



      const proCard = document.getElementById('upgradeProCard');

      const proMaxCard = document.getElementById('upgradeProMaxCard');

      if (proCard) proCard.classList.toggle('plan-card--current', plan === 'pro');

      if (proMaxCard) proMaxCard.classList.toggle('plan-card--current', isProMax);



      const proBtn = document.getElementById('upgradeProBtn');

      if (proBtn) proBtn.textContent = `Upgrade to Pro — ${p.formatEur(p.proSubscriptionEur)}/month`;

      setBtnVisible(proBtn, !isPro);



      const proMaxBtn = document.getElementById('upgradeProMaxBtn');

      if (proMaxBtn) {

        proMaxBtn.textContent = isPro

          ? `Upgrade to Pro Max — ${p.formatEur(p.proMaxSubscriptionEur)}/month`

          : `Get Pro Max — ${p.formatEur(p.proMaxSubscriptionEur)}/month`;

      }

      setBtnVisible(proMaxBtn, !isProMax);



      PlanPricing.renderUpgradeCreditPacks(plan, reason);



      const autoLabel = document.getElementById('autoRechargeLabel');

      if (autoLabel) {

        const m = p.mediumPack();

        if (m) {

          autoLabel.textContent =

            `Auto-recharge ${m.credits} credits (${p.formatEur(m.priceEur)}) when I run out — max 2/month (off by default)`;

        }

      }

    },

  };



  window.PlanPricing = PlanPricing;



  function boot() {

    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;

    if (document.getElementById('upgradeModalIntro')) PlanPricing.renderUpgradeModal();

  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);

  else boot();

})();

