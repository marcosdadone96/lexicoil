/**
 * Merge local guest/device data with server sync payload (union, deduped).
 */
(function () {
  function fcKey(fc) {
    const w = String(fc?.word || '').trim().toLowerCase();
    const lang = String(fc?.sourceLang || fc?.lang || '').trim().toLowerCase();
    return `${w}|${lang}`;
  }

  function mergeFlashcards(local, server, tombstones) {
    const map = new Map();
    for (const fc of [...(server || []), ...(local || [])]) {
      if (!fc || !fc.word) continue;
      const key = fcKey(fc);
      const prev = map.get(key);
      const ts = Number(fc.savedAt || fc.nextReview || 0);
      const prevTs = Number(prev?.savedAt || prev?.nextReview || 0);
      if (!prev || ts >= prevTs) map.set(key, fc);
    }
    return [...map.values()].filter((fc) => !isFcTombstoned(fc, tombstones)).slice(0, 500);
  }

  function isFcTombstoned(fc, tombstones) {
    const key = fcKey(fc);
    const fcTs = Number(fc.savedAt || fc.nextReview || 0);
    for (const t of tombstones || []) {
      if (String(t.key) === key && Number(t.deletedAt) >= fcTs) return true;
    }
    return false;
  }

  function historyKey(h) {
    return `${h?.date || ''}|${h?.level || ''}|${h?.lang || ''}|${h?.score ?? ''}|${h?.topic || ''}`;
  }

  function mergeHistory(local, server) {
    const seen = new Set();
    const out = [];
    const all = [...(server || []), ...(local || [])].sort(
      (a, b) => new Date(b?.date || 0) - new Date(a?.date || 0),
    );
    for (const h of all) {
      if (!h) continue;
      const k = historyKey(h);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(h);
      if (out.length >= 200) break;
    }
    return out;
  }

  const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

  function mergeTombstones(local, server) {
    const map = new Map();
    for (const t of [...(server || []), ...(local || [])]) {
      if (!t) continue;
      const mapKey = t.id != null ? `i:${t.id}` : t.key != null ? `k:${t.key}` : null;
      if (!mapKey) continue;
      const prev = map.get(mapKey);
      const ts = Number(t.deletedAt) || 0;
      const prevTs = Number(prev?.deletedAt) || 0;
      if (!prev || ts >= prevTs) {
        map.set(
          mapKey,
          t.id != null
            ? { id: String(t.id), deletedAt: ts }
            : { key: String(t.key), deletedAt: ts },
        );
      }
    }
    const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
    return [...map.values()].filter((t) => t.deletedAt >= cutoff);
  }

  function savedExamTs(e) {
    return Date.parse(e?.savedAt) || Number(e?.id) || 0;
  }

  function isSavedExamTombstoned(e, tombstones) {
    const id = e?.id || e?.data?._savedId;
    if (!id) return true;
    const examTs = savedExamTs(e);
    for (const t of tombstones || []) {
      if (String(t.id) === String(id) && Number(t.deletedAt) >= examTs) return true;
    }
    return false;
  }

  function mergeSavedExams(local, server, tombstones) {
    const map = new Map();
    for (const e of [...(server || []), ...(local || [])]) {
      if (!e) continue;
      const id = e.id || e.data?._savedId;
      if (!id) continue;
      const sid = String(id);
      const prev = map.get(sid);
      const ts = savedExamTs(e);
      const prevTs = prev ? savedExamTs(prev) : 0;
      if (!prev || ts >= prevTs) map.set(sid, e);
    }
    return [...map.values()].filter((e) => !isSavedExamTombstoned(e, tombstones)).slice(0, 50);
  }

  function goalTs(g) {
    if (!g) return 0;
    const u = Number(g.updatedAt);
    if (u) return u;
    const m = String(g.id || '').match(/goal_([a-z0-9]+)/i);
    if (m) return parseInt(m[1], 36) || 0;
    return 0;
  }

  function mergeGoals(local, server) {
    const map = new Map();
    for (const g of [...(server || []), ...(local || [])]) {
      if (!g || !g.id) continue;
      const prev = map.get(g.id);
      if (!prev || goalTs(g) >= goalTs(prev)) map.set(g.id, g);
    }
    return [...map.values()].slice(0, 50);
  }

  function mergeMastery(local, server) {
    if (typeof AnalyticsStore !== 'undefined' && AnalyticsStore.mergeProfiles) {
      return AnalyticsStore.mergeProfiles(local || { profiles: {} }, server || { profiles: {} });
    }
    const l = local && typeof local === 'object' ? local : { profiles: {} };
    const s = server && typeof server === 'object' ? server : { profiles: {} };
    return { profiles: { ...(s.profiles || {}), ...(l.profiles || {}) } };
  }

  function mergeNotebook(local, server) {
    const map = new Map();
    for (const t of [...(server?.tabs || []), ...(local?.tabs || [])]) {
      if (!t?.id) continue;
      const prev = map.get(t.id);
      const ts = Number(t.updatedAt) || 0;
      const prevTs = Number(prev?.updatedAt) || 0;
      if (!prev || ts >= prevTs) map.set(t.id, t);
    }
    return { tabs: [...map.values()].slice(0, 100) };
  }

  window.mergeSyncPayload = function mergeSyncPayload(local, server) {
    const l = local && typeof local === 'object' ? local : {};
    const s = server && typeof server === 'object' ? server : {};
    const deletedSavedExams = mergeTombstones(l.deletedSavedExams, s.deletedSavedExams);
    const deletedFlashcards = mergeTombstones(l.deletedFlashcards, s.deletedFlashcards);
    const activityLog = ActivityTrack.mergeActivity(l.activityLog, s.activityLog);
    return {
      flashcards: mergeFlashcards(l.flashcards, s.flashcards, deletedFlashcards),
      history: mergeHistory(l.history, s.history),
      savedExams: mergeSavedExams(l.savedExams, s.savedExams, deletedSavedExams),
      deletedSavedExams,
      deletedFlashcards,
      activityLog,
      studyTime: ActivityTrack.mergeStudyTime(l.studyTime, s.studyTime, activityLog),
      mastery: mergeMastery(l.mastery, s.mastery),
      burned: (typeof BurnedRegistry !== 'undefined') ? BurnedRegistry.mergeBurned(l.burned, s.burned) : (l.burned || s.burned || { v: 1, keys: [], ids: [] }),
      goals: mergeGoals(l.goals, s.goals),
      activeGoalId: l.activeGoalId || s.activeGoalId || null,
      notebook: mergeNotebook(l.notebook, s.notebook),
    };
  };
})();
