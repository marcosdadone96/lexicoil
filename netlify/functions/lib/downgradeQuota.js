'use strict';

const PersonalPoolQuota = require('../../../js/library/personalPoolQuota.js');
const { applyMonthlyAiReset, buildQuotaPayload } = require('./aiQuotaState.js');
const { aiMaxForPlan } = require('./freeTrialLib.js');

/** Clamp personal pool counters after plan downgrade so used never exceeds new max. */
function clampPersonalPoolCounters(rec, plan, month) {
  const aiMax = aiMaxForPlan(plan, null, month);
  const normalized = applyMonthlyAiReset(rec, aiMax, month);
  const lesenMax = PersonalPoolQuota.maxFor(plan, 'lesen');
  const horenMax = PersonalPoolQuota.maxFor(plan, 'horen');
  return buildQuotaPayload(
    {
      ...normalized,
      personalLesenUsed: Math.min(Math.max(0, Number(normalized.personalLesenUsed) || 0), lesenMax),
      personalHorenUsed: Math.min(Math.max(0, Number(normalized.personalHorenUsed) || 0), horenMax),
    },
    true,
  );
}

module.exports = { clampPersonalPoolCounters };
