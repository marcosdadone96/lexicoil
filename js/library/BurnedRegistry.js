/**
 * BurnedRegistry — per-user record of RECENTLY served content (cooldown model).
 *
 * Content is not blocked for life. Each passage/transcript key and item id is
 * stamped with the time it was last served. An item counts as "on cooldown"
 * only while now - lastSeen < COOLDOWN_MS. After the window it becomes available
 * again (spaced repetition; removes content-exhaustion pressure from live AI).
 *
 * Saved exams bypass the cascade and can always be retaken.
 *
 * Persisted shape (S.burned + localStorage 'lc_burned'):
 *   { v: 2, keys: string[], ids: string[], keysTs: {key:ts}, idsTs: {id:ts} }
 */
const BurnedRegistry = (() => {
  const LS_KEY = 'lc_burned';
  const DAY_MS = 24 * 60 * 60 * 1000;
  let COOLDOWN_MS = 15 * DAY_MS;

  function setCooldownDays(days) {
    const n = Number(days);
    if (Number.isFinite(n) && n >= 0) COOLDOWN_MS = n * DAY_MS;
    return COOLDOWN_MS / DAY_MS;
  }
  function getCooldownDays() {
    return COOLDOWN_MS / DAY_MS;
  }

  function ck() {
    if (typeof ContentKey !== 'undefined') return ContentKey;
    if (typeof globalThis !== 'undefined' && globalThis.ContentKey) return globalThis.ContentKey;
    return null;
  }

  function onCooldown(ts) {
    return ts != null && Date.now() - ts < COOLDOWN_MS;
  }

  function ensure() {
    if (typeof S === 'undefined') return { keysTs: new Map(), idsTs: new Map() };
    if (!S.burned || !(S.burned.keysTs instanceof Map)) {
      let raw = null;
      try {
        raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      } catch (_) {
        raw = null;
      }
      const now = Date.now();
      const keysTs = new Map();
      const idsTs = new Map();
      if (raw) {
        if (raw.keysTs) for (const [k, ts] of Object.entries(raw.keysTs)) keysTs.set(k, Number(ts) || now);
        if (raw.idsTs) for (const [id, ts] of Object.entries(raw.idsTs)) idsTs.set(id, Number(ts) || now);
        (raw.keys || []).forEach((k) => {
          if (!keysTs.has(k)) keysTs.set(k, now);
        });
        (raw.ids || []).forEach((id) => {
          if (!idsTs.has(id)) idsTs.set(id, now);
        });
      }
      S.burned = { keysTs, idsTs };
    }
    return S.burned;
  }

  function persist() {
    ensure();
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(toPayload()));
    } catch (_) {
      /* quota — ignore, server copy remains source of truth */
    }
    if (typeof Auth !== 'undefined' && Auth.pushSync) Auth.pushSync();
  }

  function isBurnedKey(key) {
    return key != null && onCooldown(ensure().keysTs.get(key));
  }
  function isBurnedId(id) {
    return id != null && onCooldown(ensure().idsTs.get(id));
  }

  function excludeSets() {
    const b = ensure();
    const excludeKeys = new Set();
    const excludeIds = new Set();
    for (const [k, ts] of b.keysTs) if (onCooldown(ts)) excludeKeys.add(k);
    for (const [id, ts] of b.idsTs) if (onCooldown(ts)) excludeIds.add(id);
    return { excludeKeys, excludeIds };
  }

  function isBankQuestionBurned(bank, q) {
    const C = ck();
    if (q?.id && isBurnedId(q.id)) return true;
    if (C) {
      const k = C.keyForBankQuestion(bank, q);
      if (k && isBurnedKey(k)) return true;
    }
    return false;
  }

  function examTouchesBurned(exam) {
    const C = ck();
    if (!C) return false;
    const { excludeKeys, excludeIds } = excludeSets();
    return C.examTouchesBurned(exam, excludeKeys, excludeIds);
  }

  function burnExam(exam) {
    const C = ck();
    if (!C) return;
    const { keys, ids } = C.keysForExam(exam);
    const b = ensure();
    const now = Date.now();
    keys.forEach((k) => b.keysTs.set(k, now));
    ids.forEach((id) => b.idsTs.set(id, now));
    persist();
  }
  const recordExam = burnExam;

  function mergeBurned(local, server) {
    const keysTs = new Map();
    const idsTs = new Map();
    const absorb = (src) => {
      if (!src) return;
      const now = Date.now();
      if (src.keysTs) for (const [k, ts] of Object.entries(src.keysTs)) keysTs.set(k, Math.max(keysTs.get(k) || 0, Number(ts) || 0));
      if (src.idsTs) for (const [id, ts] of Object.entries(src.idsTs)) idsTs.set(id, Math.max(idsTs.get(id) || 0, Number(ts) || 0));
      (src.keys || []).forEach((k) => {
        if (!keysTs.has(k)) keysTs.set(k, now);
      });
      (src.ids || []).forEach((id) => {
        if (!idsTs.has(id)) idsTs.set(id, now);
      });
    };
    absorb(local);
    absorb(server);
    return {
      v: 2,
      keys: [...keysTs.keys()],
      ids: [...idsTs.keys()],
      keysTs: Object.fromEntries(keysTs),
      idsTs: Object.fromEntries(idsTs),
    };
  }

  function toPayload() {
    const b = ensure();
    return {
      v: 2,
      keys: [...b.keysTs.keys()],
      ids: [...b.idsTs.keys()],
      keysTs: Object.fromEntries(b.keysTs),
      idsTs: Object.fromEntries(b.idsTs),
    };
  }

  return {
    setCooldownDays,
    getCooldownDays,
    isBurnedKey,
    isBurnedId,
    isBankQuestionBurned,
    excludeSets,
    examTouchesBurned,
    burnExam,
    recordExam,
    mergeBurned,
    toPayload,
  };
})();

if (typeof window !== 'undefined') window.BurnedRegistry = BurnedRegistry;
if (typeof module !== 'undefined') module.exports = BurnedRegistry;
