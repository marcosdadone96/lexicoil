'use strict';

/**
 * Pure AI credit pool helpers — month rollover, remaining balance, deduction order.
 */

function rolloverCap() {
  return Number(process.env.AI_CREDITS_ROLLOVER_CAP || 50);
}

function overdraftMax() {
  return Number(process.env.AI_CREDITS_OVERDRAFT_MAX || 5);
}

function defaultAutoRecharge() {
  return { enabled: false, pack: 40, maxPerMonth: 2, usedThisMonth: 0 };
}

/** Normalize quota blob AI fields; apply month rollover when stored month != current. */
function applyMonthlyAiReset(current, aiMax, month) {
  const q = current && typeof current === 'object' ? current : {};
  const storedMonth = String(q.month || '');
  const autoRecharge = { ...defaultAutoRecharge(), ...(q.autoRecharge || {}) };

  let used = storedMonth === month ? Number(q.used) || 0 : 0;
  let aiUsed = Number(q.aiUsed) || 0;
  let rollover = Number(q.rollover) || 0;
  let creditTopups = Number(q.creditTopups) || 0;
  let overdraft = Number(q.overdraft) || 0;

  if (storedMonth && storedMonth !== month) {
    const prevMax = Number(q.aiMax) || aiMax;
    const prevAiUsed = Number(q.aiUsed) || 0;
    const leftover = Math.max(0, prevMax - prevAiUsed);
    // Pack topups never expire — only monthly pool and rollover reset.
    rollover = aiMax > 0 ? Math.min(rolloverCap(), leftover) : 0;
    aiUsed = overdraft;
    overdraft = 0;
    autoRecharge.usedThisMonth = 0;
    used = 0;
  }

  let personalLesenUsed = storedMonth === month ? Math.max(0, Number(q.personalLesenUsed) || 0) : 0;
  let personalHorenUsed = storedMonth === month ? Math.max(0, Number(q.personalHorenUsed) || 0) : 0;
  let bgGenCountMonth = storedMonth === month ? Math.max(0, Number(q.bgGenCountMonth) || 0) : 0;
  let bgGenLesenCount = storedMonth === month ? Math.max(0, Number(q.bgGenLesenCount) || 0) : 0;
  let bgGenHorenCount = storedMonth === month ? Math.max(0, Number(q.bgGenHorenCount) || 0) : 0;
  if (storedMonth && storedMonth !== month) {
    personalLesenUsed = 0;
    personalHorenUsed = 0;
    bgGenCountMonth = 0;
    bgGenLesenCount = 0;
    bgGenHorenCount = 0;
  }

  return {
    used,
    aiUsed,
    aiMax,
    month,
    rollover,
    creditTopups,
    overdraft,
    autoRecharge,
    personalLesenUsed,
    personalHorenUsed,
    bgGenCountMonth,
    bgGenLesenCount,
    bgGenHorenCount,
    bgVocabPending: Array.isArray(q.bgVocabPending) ? q.bgVocabPending : [],
    bgVocabPendingCount: Math.max(0, Number(q.bgVocabPendingCount) || 0),
    bgVocabIneligible: Array.isArray(q.bgVocabIneligible) ? q.bgVocabIneligible : [],
    bgVocabQuarantine: Array.isArray(q.bgVocabQuarantine) ? q.bgVocabQuarantine : [],
    bgVocabDroppedCount: Math.max(0, Number(q.bgVocabDroppedCount) || 0),
    lastBgGenAt: q.lastBgGenAt || null,
    lastBgGenDayKey: q.lastBgGenDayKey || null,
    lastBgGenModule: q.lastBgGenModule === 'horen' ? 'horen' : 'lesen',
    bgGenPending: q.bgGenPending === true,
    bgGenStartedAt: q.bgGenStartedAt || null,
    bgGenStartedPlan: q.bgGenStartedPlan || null,
    bgGenCountDay: Math.max(0, Number(q.bgGenCountDay) || 0),
    bgGenLastError: q.bgGenLastError || null,
    bgGenLastRequestId: q.bgGenLastRequestId || null,
    bgGenPruneLog: Array.isArray(q.bgGenPruneLog) ? q.bgGenPruneLog : [],
    version: Number(q.version) || 0,
  };
}

function computeAiRemaining(rec) {
  const monthly = Math.max(0, (Number(rec.aiMax) || 0) - (Number(rec.aiUsed) || 0));
  return monthly + (Number(rec.rollover) || 0) + (Number(rec.creditTopups) || 0);
}

function computeAiTotalPool(rec) {
  return (Number(rec.aiMax) || 0) + (Number(rec.rollover) || 0) + (Number(rec.creditTopups) || 0);
}

/** Pre-flight: enough balance or one-time courtesy overdraft. */
function canAffordAiCost(rec, cost) {
  const remaining = computeAiRemaining(rec);
  if (remaining >= cost) {
    return { ok: true, remaining, useOverdraft: false };
  }
  const od = Number(rec.overdraft) || 0;
  const cushion = overdraftMax();
  if (od === 0 && remaining + cushion >= cost) {
    return {
      ok: true,
      remaining,
      useOverdraft: true,
      overdraftAmount: cost - remaining,
    };
  }
  return { ok: false, remaining };
}

/** Deduct cost: monthly → rollover → topups. Returns updated rec or { error }. */
function deductAiCost(rec, cost) {
  let aiUsed = Number(rec.aiUsed) || 0;
  let rollover = Number(rec.rollover) || 0;
  let creditTopups = Number(rec.creditTopups) || 0;
  let left = cost;

  const monthlyLeft = Math.max(0, rec.aiMax - aiUsed);
  const fromMonthly = Math.min(left, monthlyLeft);
  aiUsed += fromMonthly;
  left -= fromMonthly;

  if (left > 0) {
    const fromRoll = Math.min(left, rollover);
    rollover -= fromRoll;
    left -= fromRoll;
  }

  if (left > 0) {
    const fromTop = Math.min(left, creditTopups);
    creditTopups -= fromTop;
    left -= fromTop;
  }

  if (left > 0) {
    return { error: 'ai_credits_exhausted' };
  }

  return { ...rec, aiUsed, rollover, creditTopups };
}

/** Courtesy buffer: exhaust pools and record overdraft debt for next cycle. */
function applyCourtesyOverdraft(rec, cost) {
  const remaining = computeAiRemaining(rec);
  return {
    ...rec,
    aiUsed: rec.aiMax,
    rollover: 0,
    creditTopups: 0,
    overdraft: cost - remaining,
  };
}

function buildQuotaPayload(rec, versionBump = true) {
  return {
    used: rec.used,
    aiUsed: rec.aiUsed,
    aiMax: rec.aiMax,
    month: rec.month,
    rollover: rec.rollover,
    creditTopups: rec.creditTopups,
    overdraft: rec.overdraft,
    autoRecharge: rec.autoRecharge,
    personalLesenUsed: rec.personalLesenUsed || 0,
    personalHorenUsed: rec.personalHorenUsed || 0,
    bgGenCountMonth: rec.bgGenCountMonth || 0,
    bgGenLesenCount: rec.bgGenLesenCount || 0,
    bgGenHorenCount: rec.bgGenHorenCount || 0,
    bgVocabPending: Array.isArray(rec.bgVocabPending) ? rec.bgVocabPending : [],
    bgVocabPendingCount: Math.max(0, Number(rec.bgVocabPendingCount) || 0),
    bgVocabIneligible: Array.isArray(rec.bgVocabIneligible) ? rec.bgVocabIneligible : [],
    bgVocabQuarantine: Array.isArray(rec.bgVocabQuarantine) ? rec.bgVocabQuarantine : [],
    bgVocabDroppedCount: Math.max(0, Number(rec.bgVocabDroppedCount) || 0),
    lastBgGenAt: rec.lastBgGenAt || null,
    lastBgGenDayKey: rec.lastBgGenDayKey || null,
    lastBgGenModule: rec.lastBgGenModule === 'horen' ? 'horen' : 'lesen',
    bgGenPending: rec.bgGenPending === true,
    bgGenStartedAt: rec.bgGenStartedAt || null,
    bgGenStartedPlan: rec.bgGenStartedPlan || null,
    bgGenCountDay: Math.max(0, Number(rec.bgGenCountDay) || 0),
    bgGenLastError: rec.bgGenLastError || null,
    bgGenLastRequestId: rec.bgGenLastRequestId || null,
    bgGenPruneLog: Array.isArray(rec.bgGenPruneLog) ? rec.bgGenPruneLog : [],
    version: versionBump ? (Number(rec.version) || 0) + 1 : Number(rec.version) || 0,
  };
}

module.exports = {
  rolloverCap,
  overdraftMax,
  defaultAutoRecharge,
  applyMonthlyAiReset,
  computeAiRemaining,
  computeAiTotalPool,
  canAffordAiCost,
  deductAiCost,
  applyCourtesyOverdraft,
  buildQuotaPayload,
};
