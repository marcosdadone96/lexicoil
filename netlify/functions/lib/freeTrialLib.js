'use strict';

const { checkActionAccess, isPaidPlan, normalizePlan } = require('./actionAccessLib.js');

/** Calendar month key YYYY-MM for a date (or now). */
function getMonthKey(date) {
  const d = date ? (date instanceof Date ? date : new Date(date)) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function aiCreditsFreeMax() {
  return Number(process.env.AI_CREDITS_FREE || 6);
}

function aiCreditsProMax() {
  return Number(process.env.AI_CREDITS_PRO || 40);
}

function aiCreditsProMaxTierMax() {
  return Number(process.env.AI_CREDITS_PRO_MAX || 150);
}

/** Optional one-time welcome bonus during signup month (default 0). */
function aiCreditsWelcomeBonusMax() {
  return Number(process.env.AI_CREDITS_WELCOME_BONUS || 0);
}

/** @deprecated alias — kept for API responses; equals free base + optional welcome bonus. */
function aiCreditsFreeTrialMax() {
  return aiCreditsFreeMax() + aiCreditsWelcomeBonusMax();
}

function memberSinceMonth(user) {
  const since = user?.createdAt || user?.memberSince;
  if (!since) return null;
  return getMonthKey(since);
}

/** Signup month — optional welcome bonus only; base free access no longer depends on this. */
function isFreeAiTrialActive(user, monthKey = getMonthKey()) {
  if (!user) return false;
  const startMonth = memberSinceMonth(user);
  if (!startMonth) return false;
  return startMonth === monthKey;
}

function canAccessAiCredits(plan, user, monthKey = getMonthKey(), action = null) {
  if (action) {
    return checkActionAccess(plan, action).ok;
  }
  const p = normalizePlan(plan);
  if (p === 'guest') return false;
  if (isPaidPlan(p)) return true;
  if (p === 'free') return aiMaxForPlan(p, user, monthKey) > 0;
  return false;
}

function aiMaxForPlan(plan, user, monthKey = getMonthKey()) {
  const p = normalizePlan(plan);
  if (p === 'pro_max') return aiCreditsProMaxTierMax();
  if (p === 'pro') return aiCreditsProMax();
  if (p === 'free') {
    let max = aiCreditsFreeMax();
    if (isFreeAiTrialActive(user, monthKey) && aiCreditsWelcomeBonusMax() > 0) {
      max += aiCreditsWelcomeBonusMax();
    }
    return max;
  }
  return 0;
}

module.exports = {
  getMonthKey,
  aiCreditsFreeMax,
  aiCreditsProMax,
  aiCreditsProMaxTierMax,
  aiCreditsWelcomeBonusMax,
  aiCreditsFreeTrialMax,
  memberSinceMonth,
  isFreeAiTrialActive,
  canAccessAiCredits,
  aiMaxForPlan,
};
