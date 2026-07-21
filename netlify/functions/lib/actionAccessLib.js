'use strict';

/** Monthly AI credit actions and which plans may use them (before balance check). */
const ACTION_ACCESS = {
  personal_exam: ['pro', 'pro_max'],
  personal_lesen: ['free', 'pro', 'pro_max'],
  personal_horen: ['free', 'pro', 'pro_max'],
  personal_schreiben: ['pro', 'pro_max'],
  personal_sprechen_gen: ['pro', 'pro_max'],
  grammar_coaching: ['pro', 'pro_max'],
  writing_correction: ['free', 'pro', 'pro_max'],
  speaking: ['free', 'pro', 'pro_max'],
  speaking_realtime: ['pro', 'pro_max'],
  vocab_quiz: ['free', 'pro', 'pro_max'],
  listening_game: ['free', 'pro', 'pro_max'],
  vocab_phrases: ['free', 'pro', 'pro_max'],
  tts: ['pro', 'pro_max'],
};

function normalizePlan(plan) {
  const p = String(plan || 'guest').toLowerCase();
  if (p === 'pro_max') return 'pro_max';
  if (p === 'pro') return 'pro';
  if (p === 'free') return 'free';
  return 'guest';
}

function isPaidPlan(plan) {
  const p = normalizePlan(plan);
  return p === 'pro' || p === 'pro_max';
}

function checkActionAccess(plan, action) {
  const allowed = ACTION_ACCESS[action];
  if (!allowed) return { ok: false, error: 'unknown_action' };
  const p = normalizePlan(plan);
  if (p === 'guest') {
    return { ok: false, error: 'login_required', plan: p };
  }
  if (!allowed.includes(p)) {
    return { ok: false, error: 'pro_only', plan: p };
  }
  return { ok: true, plan: p };
}

/** full = Pro rubric + corrections; basic = orientative score + error counts only. */
function feedbackLevelForPlan(plan) {
  return isPaidPlan(plan) ? 'full' : 'basic';
}

module.exports = {
  ACTION_ACCESS,
  normalizePlan,
  isPaidPlan,
  checkActionAccess,
  feedbackLevelForPlan,
};
