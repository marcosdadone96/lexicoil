/**
 * Monthly personal Lesen/Hören pool quota (separate from AI credits).
 * Free 8+8 · Pro 30+30 · Pro Max 60+60 (generous cap; rate-limit 60/min still applies).
 *
 * Shared with background vocab generation: manual Via A pool assembly and bg auto-gen
 * both increment personalLesenUsed / personalHorenUsed on the same monthly counters.
 */
const PersonalPoolQuota = (() => {
  const LIMITS = Object.freeze({
    free: { lesen: 8, horen: 8 },
    pro: { lesen: 30, horen: 30 },
    pro_max: { lesen: 60, horen: 60 },
    guest: { lesen: 0, horen: 0 },
  });

  function normalizePlan(plan) {
    const p = String(plan || 'guest').toLowerCase();
    if (p === 'pro_max') return 'pro_max';
    if (p === 'pro') return 'pro';
    if (p === 'free') return 'free';
    return 'guest';
  }

  function normalizeModule(mod) {
    const m = String(mod || '').toLowerCase();
    if (m === 'reading' || m === 'lesen') return 'lesen';
    if (m === 'listening' || m === 'horen') return 'horen';
    return null;
  }

  function maxFor(plan, module) {
    const p = normalizePlan(plan);
    const mod = normalizeModule(module);
    if (!mod) return 0;
    return LIMITS[p]?.[mod] ?? 0;
  }

  function usedFromRecord(rec, module) {
    const mod = normalizeModule(module);
    if (!mod || !rec) return 0;
    const key = mod === 'lesen' ? 'personalLesenUsed' : 'personalHorenUsed';
    return Math.max(0, Number(rec[key]) || 0);
  }

  function remainingFor(plan, module, rec) {
    return Math.max(0, maxFor(plan, module) - usedFromRecord(rec, module));
  }

  function canUse(plan, module, rec) {
    const p = normalizePlan(plan);
    if (p === 'guest') return false;
    const mod = normalizeModule(module);
    if (!mod) return false;
    return remainingFor(p, mod, rec) > 0;
  }

  function applyMonthReset(current, month) {
    const q = current && typeof current === 'object' ? current : {};
    const storedMonth = String(q.month || '');
    if (storedMonth && storedMonth !== month) {
      return { personalLesenUsed: 0, personalHorenUsed: 0 };
    }
    return {
      personalLesenUsed: Math.max(0, Number(q.personalLesenUsed) || 0),
      personalHorenUsed: Math.max(0, Number(q.personalHorenUsed) || 0),
    };
  }

  function payloadFields(rec) {
    return {
      personalLesenUsed: Math.max(0, Number(rec?.personalLesenUsed) || 0),
      personalHorenUsed: Math.max(0, Number(rec?.personalHorenUsed) || 0),
      personalLesenMax: maxFor(rec?.plan || 'free', 'lesen'),
      personalHorenMax: maxFor(rec?.plan || 'free', 'horen'),
    };
  }

  return {
    LIMITS,
    normalizePlan,
    normalizeModule,
    maxFor,
    usedFromRecord,
    remainingFor,
    canUse,
    applyMonthReset,
    payloadFields,
  };
})();

if (typeof window !== 'undefined') window.PersonalPoolQuota = PersonalPoolQuota;
if (typeof module !== 'undefined') module.exports = PersonalPoolQuota;
