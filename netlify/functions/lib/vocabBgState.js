'use strict';
/**
 * vocabBgState.js â€” background vocab generation state on quota blob.
 *
 * Pool quota note (Case 8): manual Via A (exam-part pool assembly) and background
 * generation both consume the same monthly personalLesenUsed / personalHorenUsed
 * counters â€” they may run in parallel but share one pool monthly cap per module.
 */
const fs = require('fs');
const path = require('path');
const PersonalPoolQuota = require('../../../js/library/personalPoolQuota.js');
const BATCH_TRIGGER = 4;
/** Min pending to enqueue vocab-bg-sweep (cron safety net). Not a separate gen trigger when BATCH_TRIGGER >= this. */
const BATCH_DAILY_MIN = 4;
const FREQ_HOURS = 12;
const FREE_BG_GEN_MAX = 2;
/** Users with <4 eligible pending words ONLY trigger bg via this stale fallback. */
const STALE_FALLBACK_DAYS = 30;
const BG_GEN_PENDING_STALE_MS = 30 * 60 * 1000;
const DOWNGRADE_CANCEL_PENDING_MS = 30 * 60 * 1000;
const PENDING_MAX = 120;
const BULK_SYNC_ADD_THRESHOLD = 20;
const MAX_BG_GENS_PER_DAY = 4;
const MAX_RETRY_SAME_REASON = 3;
const BACKOFF_HOURS = [12, 24, 48];
let _parseLeadingArticle = null;
function parseLeadingArticle(word, lang) {
  if (!_parseLeadingArticle) {
    try {
      _parseLeadingArticle = require('../../../js/data/manualVocab.js').parseLeadingArticle;
    } catch {
      _parseLeadingArticle = (w, sub) => {
        const raw = String(w || '').trim();
        if (sub === 'de') {
          const m = raw.match(/^(der|die|das)\s+(.+)$/i);
          if (m) return { word: m[2].trim(), article: m[1].toLowerCase() };
        }
        if (sub === 'es') {
          const m = raw.match(/^(el|la|los|las)\s+(.+)$/i);
          if (m) return { word: m[2].trim(), article: m[1].toLowerCase() };
        }
        return { word: raw, article: null };
      };
    }
  }
  return _parseLeadingArticle(word, lang);
}
const _bankSets = new Map();
function loadVocabBankLemmaSet(lang = 'de', level = 'B1') {
  const key = `${lang}|${level}`;
  if (_bankSets.has(key)) return _bankSets.get(key);
  const file = path.join(__dirname, '../../../library/vocab', lang, `${level}.json`);
  const set = new Set();
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const raw = Array.isArray(data) ? data : data.lemmas || data.words || [];
      for (const w of raw) {
        const lw = String(w).trim().toLowerCase();
        if (lw) set.add(lw);
      }
    } catch {
      /* empty bank */
    }
  }
  _bankSets.set(key, set);
  return set;
}
function getMonthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
/** Account-level key: lemma|lang (articles stripped via parseLeadingArticle). */
function fcKey(fc) {
  const lang = String(fc?.sourceLang || fc?.lang || 'de').trim().toLowerCase();
  const parsed = parseLeadingArticle(String(fc?.word || '').trim(), lang);
  const w = parsed.word.trim().toLowerCase();
  return w ? `${w}|${lang}` : `|${lang}`;
}
function tombstoneToKey(t) {
  if (t?.key) {
    const parts = String(t.key).split('|');
    return fcKey({ word: parts[0] || '', sourceLang: parts[1] || 'de' });
  }
  return fcKey(t);
}
function classifyWordForBg(word, lang = 'de', level = 'B1') {
  const parsed = parseLeadingArticle(String(word || '').trim(), lang);
  const lemma = parsed.word.trim().toLowerCase();
  if (!lemma) return { ok: false, reason: 'empty', lemma: '' };
  const bank = loadVocabBankLemmaSet(lang, level);
  if (!bank.has(lemma)) return { ok: false, reason: 'out_of_bank', lemma };
  return { ok: true, lemma, article: parsed.article || null };
}
function normalizePendingEntry(fc) {
  if (!fc?.word) return null;
  const lang = String(fc.sourceLang || fc.lang || 'de').trim().toLowerCase();
  const level = String(fc.sourceLevel || fc.level || 'B1').trim().toUpperCase();
  const parsed = parseLeadingArticle(String(fc.word).trim(), lang);
  const lemma = parsed.word.trim();
  if (!lemma) return null;
  const key = fcKey({ word: lemma, sourceLang: lang });
  return {
    word: lemma,
    article: parsed.article || fc.article || null,
    lang,
    level,
    savedAt: Math.max(0, Number(fc.savedAt) || Date.now()),
    queuedAt: Date.now(),
    key,
    attemptCount: 0,
    lastFailReason: null,
    lastFailAt: null,
    nextRetryAt: null,
  };
}
function applyBgMonthReset(rec, month) {
  const q = rec && typeof rec === 'object' ? rec : {};
  const storedMonth = String(q.month || '');
  if (storedMonth && storedMonth !== month) {
    return {
      bgGenCountMonth: 0,
      bgGenLesenCount: 0,
      bgGenHorenCount: 0,
      bgGenCountDay: 0,
    };
  }
  return {
    bgGenCountMonth: Math.max(0, Number(q.bgGenCountMonth) || 0),
    bgGenLesenCount: Math.max(0, Number(q.bgGenLesenCount) || 0),
    bgGenHorenCount: Math.max(0, Number(q.bgGenHorenCount) || 0),
    bgGenCountDay: Math.max(0, Number(q.bgGenCountDay) || 0),
  };
}
function resetBgGenCountDayIfNeeded(rec) {
  const dayKey = getDayKey();
  if (String(rec.lastBgGenDayKey || '') === dayKey) {
    return { bgGenCountDay: Math.max(0, Number(rec.bgGenCountDay) || 0) };
  }
  return { bgGenCountDay: 0 };
}
/** Merge bg fields into normalized quota rec after monthly reset. */
function attachBgFields(rec) {
  const pending = Array.isArray(rec.bgVocabPending) ? rec.bgVocabPending : [];
  return {
    bgVocabPending: pending.slice(0, PENDING_MAX),
    bgVocabPendingCount: effectivePendingCount(rec),
    bgVocabIneligible: Array.isArray(rec.bgVocabIneligible) ? rec.bgVocabIneligible.slice(-100) : [],
    bgVocabQuarantine: Array.isArray(rec.bgVocabQuarantine) ? rec.bgVocabQuarantine.slice(-200) : [],
    bgVocabDroppedCount: Math.max(0, Number(rec.bgVocabDroppedCount) || 0),
    lastBgGenAt: rec.lastBgGenAt || null,
    lastBgGenDayKey: rec.lastBgGenDayKey || null,
    bgGenCountMonth: Math.max(0, Number(rec.bgGenCountMonth) || 0),
    bgGenCountDay: Math.max(0, Number(rec.bgGenCountDay) || 0),
    lastBgGenModule: rec.lastBgGenModule === 'horen' ? 'horen' : 'lesen',
    bgGenLesenCount: Math.max(0, Number(rec.bgGenLesenCount) || 0),
    bgGenHorenCount: Math.max(0, Number(rec.bgGenHorenCount) || 0),
    bgGenPending: rec.bgGenPending === true,
    bgGenStartedAt: rec.bgGenStartedAt || null,
    bgGenStartedPlan: rec.bgGenStartedPlan || null,
    bgGenLastError: rec.bgGenLastError || null,
    bgGenLastRequestId: rec.bgGenLastRequestId || null,
    bgGenPruneLog: Array.isArray(rec.bgGenPruneLog) ? rec.bgGenPruneLog.slice(-20) : [],
  };
}
function getEligiblePendingEntries(rec) {
  const now = Date.now();
  return (rec.bgVocabPending || []).filter((p) => {
    if (p.exhausted) return false;
    if (p.nextRetryAt && Number(p.nextRetryAt) > now) return false;
    return true;
  });
}
function effectivePendingCount(rec) {
  return getEligiblePendingEntries(rec).length;
}
function oldestPendingAgeDays(rec) {
  const entries = getEligiblePendingEntries(rec);
  if (!entries.length) return 0;
  const oldest = Math.min(...entries.map((p) => Number(p.queuedAt || p.savedAt) || Date.now()));
  return (Date.now() - oldest) / (86400 * 1000);
}
/**
 * Remove pending entries no longer in live deck or tombstoned.
 * @returns {{ patch: object, removed: object[] }}
 */
function pruneBgVocabPending(rec, liveFlashcards, tombstones) {
  const liveKeys = new Set((liveFlashcards || []).map((fc) => fcKey(fc)));
  const tombKeys = new Set((tombstones || []).map((t) => tombstoneToKey(t)));
  const removed = [];
  const kept = [];
  for (const p of rec.bgVocabPending || []) {
    const key = p.key || fcKey({ word: p.word, sourceLang: p.lang });
    if (!liveKeys.has(key) || tombKeys.has(key)) {
      removed.push({
        word: p.word,
        key,
        skippedReason: 'user_removed',
        at: Date.now(),
      });
    } else {
      kept.push(p);
    }
  }
  const pruneLog = [...(rec.bgGenPruneLog || []), ...removed].slice(-20);
  return {
    patch: {
      bgVocabPending: kept,
      bgVocabPendingCount: kept.filter((p) => !p.nextRetryAt || p.nextRetryAt <= Date.now()).length,
      bgGenPruneLog: pruneLog,
    },
    removed,
  };
}
function upsertIneligible(rec, entry) {
  const list = [...(rec.bgVocabIneligible || [])];
  const key = `${entry.lemma}|${entry.lang || 'de'}`;
  const idx = list.findIndex((e) => `${e.word}|${e.lang || 'de'}` === key);
  const row = {
    word: entry.lemma,
    lang: entry.lang || 'de',
    reason: entry.reason || 'out_of_bank',
    at: Date.now(),
  };
  if (idx >= 0) list[idx] = row;
  else list.push(row);
  return list.slice(-100);
}
/** FIFO cap â€” keep oldest entries; increment bgVocabDroppedCount for overflow. */
function applyPendingFifoCap(rec) {
  const pending = [...(rec.bgVocabPending || [])];
  if (pending.length <= PENDING_MAX) {
    return { bgVocabPending: pending, dropped: 0, bgVocabDroppedCount: rec.bgVocabDroppedCount || 0 };
  }
  const dropped = pending.length - PENDING_MAX;
  return {
    bgVocabPending: pending.slice(0, PENDING_MAX),
    dropped,
    bgVocabDroppedCount: Math.max(0, Number(rec.bgVocabDroppedCount) || 0) + dropped,
  };
}
function recoverStaleBgGenIfNeeded(rec) {
  if (!rec.bgGenPending) return {};
  const started = Number(rec.bgGenStartedAt) || 0;
  if (started && Date.now() - started > BG_GEN_PENDING_STALE_MS) {
    return {
      bgGenPending: false,
      bgGenLastError: rec.bgGenLastError || 'stale_bg_gen_recovery',
      bgGenStartedAt: null,
    };
  }
  return {};
}
/**
 * Diff incoming flashcards vs previous snapshot; accumulate pending new words (lemma-only).
 */
function accumulateBgVocabFromSync(prevCards, nextCards, rec, lastBgGenAt) {
  const prevMap = new Map();
  for (const fc of prevCards || []) {
    const k = fcKey(fc);
    if (!k || k.startsWith('|')) continue;
    prevMap.set(k, Math.max(0, Number(fc.savedAt) || 0));
  }
  const pending = Array.isArray(rec.bgVocabPending) ? [...rec.bgVocabPending] : [];
  const pendingKeys = new Set(pending.map((p) => p.key));
  let ineligible = [...(rec.bgVocabIneligible || [])];
  const cutoff = Math.max(0, Number(lastBgGenAt) || 0);
  let added = 0;
  let addedIneligible = 0;
  for (const fc of nextCards || []) {
    const entry = normalizePendingEntry(fc);
    if (!entry) continue;
    const prevSavedAt = prevMap.get(entry.key);
    const isNew =
      prevSavedAt == null ||
      (entry.savedAt > prevSavedAt && entry.savedAt > cutoff);
    if (!isNew) continue;
    if (pendingKeys.has(entry.key)) continue;
    const cls = classifyWordForBg(entry.word, entry.lang, entry.level);
    if (!cls.ok) {
      ineligible = upsertIneligible({ bgVocabIneligible: ineligible }, {
        lemma: cls.lemma || entry.word,
        lang: entry.lang,
        reason: cls.reason,
      });
      addedIneligible++;
      continue;
    }
    pending.push(entry);
    pendingKeys.add(entry.key);
    added++;
  }
  return {
    bgVocabPending: pending,
    bgVocabIneligible: ineligible,
    bgVocabPendingCount: pending.length,
    added,
    addedIneligible,
  };
}
function hoursSince(ts) {
  if (!ts) return Infinity;
  return (Date.now() - Number(ts)) / (3600 * 1000);
}
function pickNextModule(rec) {
  const last = rec.lastBgGenModule === 'horen' ? 'horen' : 'lesen';
  return last === 'lesen' ? 'horen' : 'lesen';
}
/**
 * Full sync pipeline: prune â†’ accumulate â†’ FIFO cap â†’ stale recovery.
 */
function processBgVocabSync({ prevCards, nextCards, rec, tombstones }) {
  let state = { ...rec, ...resetBgGenCountDayIfNeeded(rec) };
  const pruned = pruneBgVocabPending(state, nextCards, tombstones);
  state = { ...state, ...pruned.patch };
  const acc = accumulateBgVocabFromSync(prevCards, nextCards, state, state.lastBgGenAt);
  state = { ...state, ...acc };
  const capped = applyPendingFifoCap(state);
  state = { ...state, ...capped };
  const recovered = recoverStaleBgGenIfNeeded(state);
  state = { ...state, ...recovered };
  state.bgVocabPendingCount = effectivePendingCount(state);
  return {
    state,
    added: acc.added,
    addedIneligible: acc.addedIneligible,
    dropped: capped.dropped || 0,
    pruneRemoved: pruned.removed,
    bulkDeferTrigger: acc.added > BULK_SYNC_ADD_THRESHOLD,
  };
}
/**
 * Evaluate whether background generation should run.
 * Mutex: one active bg gen per account (bgGenPending), with stale recovery after 30 min.
 */
function evaluateBgEligibility(rec, plan) {
  const month = getMonthKey();
  const dayKey = getDayKey();
  const pendingCount = effectivePendingCount(rec);
  const lastAt = rec.lastBgGenAt || null;
  const hours = hoursSince(lastAt);
  const dayReset = resetBgGenCountDayIfNeeded(rec);
  const bgGenCountDay = dayReset.bgGenCountDay;
  if (rec.bgGenPending === true) {
    return {
      eligible: false,
      reason: 'bg_gen_in_progress',
      pendingCount,
    };
  }
  if (hours < FREQ_HOURS) {
    return { eligible: false, reason: 'frequency_cap', hours, pendingCount };
  }
  if (bgGenCountDay >= MAX_BG_GENS_PER_DAY) {
    return { eligible: false, reason: 'daily_bg_cap', bgGenCountDay, pendingCount };
  }
  const p = PersonalPoolQuota.normalizePlan(plan);
  if (p === 'guest') {
    return { eligible: false, reason: 'guest' };
  }
  const bgCount = Math.max(0, Number(rec.bgGenCountMonth) || 0);
  if (p === 'free' && bgCount >= FREE_BG_GEN_MAX) {
    return { eligible: false, reason: 'free_bg_cap', bgCount };
  }
  const module = pickNextModule(rec);
  const modNorm = PersonalPoolQuota.normalizeModule(module);
  if (!PersonalPoolQuota.canUse(p, modNorm, rec)) {
    const alt = modNorm === 'lesen' ? 'horen' : 'lesen';
    if (!PersonalPoolQuota.canUse(p, alt, rec)) {
      return { eligible: false, reason: 'pool_quota_exceeded', module: modNorm };
    }
  }
  const batchReady = pendingCount >= BATCH_TRIGGER;
  /*
   * Stale fallback (Case 1): users with < BATCH_TRIGGER eligible pending words ONLY
   * activate background generation through this 30-day path — not via batch threshold.
   * (Legacy daily_fallback trigger removed: unreachable when BATCH_TRIGGER === BATCH_DAILY_MIN.)
   */
  const staleReady =
    pendingCount >= 1 &&
    oldestPendingAgeDays(rec) >= STALE_FALLBACK_DAYS &&
    hours >= FREQ_HOURS;
  if (!batchReady && !staleReady) {
    return {
      eligible: false,
      reason: 'pending_insufficient',
      pendingCount,
      batchReady,
      staleReady,
    };
  }
  let trigger = 'batch';
  let reason = 'batch_threshold';
  if (!batchReady && staleReady) {
    trigger = 'stale';
    reason = 'stale_fallback';
  }
  return {
    eligible: true,
    reason,
    pendingCount,
    wordGoal: Math.min(pendingCount, BATCH_TRIGGER),
    module: PersonalPoolQuota.canUse(p, modNorm, rec) ? modNorm : (modNorm === 'lesen' ? 'horen' : 'lesen'),
    trigger,
  };
}
/** Fields cleared/updated after successful bg generation. */
function afterBgGenSuccessPatch(rec, { module, requestId, usedWords = [] }) {
  const mod = PersonalPoolQuota.normalizeModule(module) || 'lesen';
  const usedKeys = new Set(
    (usedWords || []).map((w) => {
      const parsed = parseLeadingArticle(String(w).trim(), 'de');
      return `${parsed.word.trim().toLowerCase()}|de`;
    }),
  );
  const remaining = (rec.bgVocabPending || []).filter((p) => !usedKeys.has(p.key));
  const dayKey = getDayKey();
  const sameDay = String(rec.lastBgGenDayKey || '') === dayKey;
  const patch = {
    bgVocabPending: remaining,
    bgVocabPendingCount: effectivePendingCount({ ...rec, bgVocabPending: remaining }),
    lastBgGenAt: Date.now(),
    lastBgGenDayKey: dayKey,
    bgGenPending: false,
    bgGenStartedAt: null,
    bgGenStartedPlan: null,
    bgGenLastError: null,
    bgGenLastRequestId: requestId || rec.bgGenLastRequestId || null,
    lastBgGenModule: mod,
    bgGenCountMonth: Math.max(0, Number(rec.bgGenCountMonth) || 0) + 1,
    bgGenCountDay: (sameDay ? Math.max(0, Number(rec.bgGenCountDay) || 0) : 0) + 1,
  };
  if (mod === 'horen') {
    patch.bgGenHorenCount = Math.max(0, Number(rec.bgGenHorenCount) || 0) + 1;
    patch.personalHorenUsed = Math.max(0, Number(rec.personalHorenUsed) || 0) + 1;
  } else {
    patch.bgGenLesenCount = Math.max(0, Number(rec.bgGenLesenCount) || 0) + 1;
    patch.personalLesenUsed = Math.max(0, Number(rec.personalLesenUsed) || 0) + 1;
  }
  return patch;
}
function markBgGenPending(rec, requestId, plan) {
  return {
    bgGenPending: true,
    bgGenLastRequestId: requestId,
    bgGenLastError: null,
    bgGenStartedAt: Date.now(),
    bgGenStartedPlan: PersonalPoolQuota.normalizePlan(plan),
  };
}
function markBgGenFailed(rec, error) {
  return {
    bgGenPending: false,
    bgGenStartedAt: null,
    bgGenLastError: String(error || 'unknown').slice(0, 240),
  };
}
/**
 * Case 9: track per-entry retries; quarantine after 3 same-reason failures.
 * Backoff: 12h â†’ 24h â†’ 48h before next attempt on remaining pending entries.
 */
function recordBgGenFailure(rec, { reason, attemptedKeys }) {
  const keys =
    attemptedKeys instanceof Set
      ? attemptedKeys
      : new Set(Array.isArray(attemptedKeys) ? attemptedKeys : []);
  const failReason = String(reason || 'unknown').slice(0, 120);
  const quarantine = [...(rec.bgVocabQuarantine || [])];
  const pending = [];
  let quarantined = 0;
  for (const p of rec.bgVocabPending || []) {
    const key = p.key || fcKey({ word: p.word, sourceLang: p.lang });
    if (!keys.has(key)) {
      pending.push(p);
      continue;
    }
    const prevReason = p.lastFailReason || null;
    const attemptCount = (p.attemptCount || 0) + 1;
    const sameReason = prevReason === failReason;
    if (attemptCount >= MAX_RETRY_SAME_REASON && sameReason) {
      quarantine.push({
        ...p,
        exhausted: true,
        exhaustedAt: Date.now(),
        lastFailReason: failReason,
        attemptCount,
      });
      quarantined++;
      continue;
    }
    const backoffIdx = Math.min(Math.max(attemptCount - 1, 0), BACKOFF_HOURS.length - 1);
    pending.push({
      ...p,
      attemptCount: sameReason || !prevReason ? attemptCount : 1,
      lastFailReason: failReason,
      lastFailAt: Date.now(),
      nextRetryAt: Date.now() + BACKOFF_HOURS[backoffIdx] * 3600 * 1000,
    });
  }
  return {
    ...markBgGenFailed(rec, failReason),
    bgVocabPending: pending,
    bgVocabQuarantine: quarantine.slice(-200),
    bgVocabPendingCount: pending.filter((x) => !x.nextRetryAt || x.nextRetryAt <= Date.now()).length,
    quarantined,
  };
}
/**
 * Case 6: cancel stale in-flight bg jobs on downgrade.
 * Jobs started <30 min ago keep running under snapshotted Pro plan (fair: user paid for that cycle).
 */
function cancelBgGenOnDowngrade(rec) {
  if (!rec.bgGenPending) return { patch: {}, cancelled: false };
  const started = Number(rec.bgGenStartedAt) || 0;
  const age = started ? Date.now() - started : Infinity;
  if (age > DOWNGRADE_CANCEL_PENDING_MS) {
    return {
      patch: {
        ...markBgGenFailed(rec, 'cancelled_downgrade_stale'),
        bgGenStartedPlan: null,
      },
      cancelled: true,
    };
  }
  return { patch: {}, cancelled: false, graceRemainingMs: Math.max(0, DOWNGRADE_CANCEL_PENDING_MS - age) };
}
function buildAttemptedKeysFromPlan(plan, pendingWords) {
  const keys = new Set();
  const addLemma = (w) => {
    const parsed = parseLeadingArticle(String(w).trim(), 'de');
    keys.add(`${parsed.word.trim().toLowerCase()}|de`);
  };
  for (const w of plan?.userAnchor || []) addLemma(w);
  for (const p of pendingWords || []) {
    if (typeof p === 'string') addLemma(p);
    else if (p?.word) addLemma(p.word);
  }
  return keys;
}
function payloadFields(rec) {
  const bg = attachBgFields(rec);
  return {
    bgVocabPendingCount: bg.bgVocabPendingCount,
    bgVocabIneligibleCount: (bg.bgVocabIneligible || []).length,
    bgVocabDroppedCount: bg.bgVocabDroppedCount,
    lastBgGenAt: bg.lastBgGenAt,
    bgGenCountMonth: bg.bgGenCountMonth,
    bgGenLesenCount: bg.bgGenLesenCount,
    bgGenHorenCount: bg.bgGenHorenCount,
    bgGenPending: bg.bgGenPending,
  };
}

const KNOWN_BG_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

/** Resolve generation level from pending flashcard entries (majority sourceLevel). */
function resolveBgLevelFromPending(pendingWords, fallback = 'B1') {
  const counts = new Map();
  for (const p of pendingWords || []) {
    const lv = String(p?.level || p?.sourceLevel || '').trim().toUpperCase();
    if (!lv || !KNOWN_BG_LEVELS.has(lv)) continue;
    counts.set(lv, (counts.get(lv) || 0) + 1);
  }
  if (!counts.size) return String(fallback || 'B1').trim().toUpperCase();
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

module.exports = {
  BATCH_TRIGGER,
  BATCH_DAILY_MIN,
  FREQ_HOURS,
  FREE_BG_GEN_MAX,
  STALE_FALLBACK_DAYS,
  BG_GEN_PENDING_STALE_MS,
  PENDING_MAX,
  BULK_SYNC_ADD_THRESHOLD,
  MAX_BG_GENS_PER_DAY,
  MAX_RETRY_SAME_REASON,
  BACKOFF_HOURS,
  fcKey,
  parseLeadingArticle,
  classifyWordForBg,
  getMonthKey,
  getDayKey,
  applyBgMonthReset,
  attachBgFields,
  accumulateBgVocabFromSync,
  pruneBgVocabPending,
  processBgVocabSync,
  evaluateBgEligibility,
  effectivePendingCount,
  getEligiblePendingEntries,
  resolveBgLevelFromPending,
  afterBgGenSuccessPatch,
  markBgGenPending,
  markBgGenFailed,
  recordBgGenFailure,
  cancelBgGenOnDowngrade,
  buildAttemptedKeysFromPlan,
  payloadFields,
  pickNextModule,
  loadVocabBankLemmaSet,
};
