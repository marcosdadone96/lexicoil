/**
 * Merge local guest/device data with server sync payload (union, deduped).
 */
(function () {
  function fcKey(fc) {
    const w = String(fc?.word || '').trim().toLowerCase();
    const lang = String(fc?.sourceLang || fc?.lang || '').trim().toLowerCase();
    return `${w}|${lang}`;
  }

  function mergeFlashcards(local, server) {
    const map = new Map();
    for (const fc of [...(server || []), ...(local || [])]) {
      if (!fc || !fc.word) continue;
      const key = fcKey(fc);
      const prev = map.get(key);
      const ts = Number(fc.savedAt || fc.nextReview || 0);
      const prevTs = Number(prev?.savedAt || prev?.nextReview || 0);
      if (!prev || ts >= prevTs) map.set(key, fc);
    }
    return [...map.values()].slice(0, 500);
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

  function mergeSavedExams(local, server) {
    const map = new Map();
    for (const e of [...(server || []), ...(local || [])]) {
      if (!e) continue;
      const id = e.id || e.data?._savedId;
      if (!id) continue;
      const prev = map.get(id);
      const ts = Date.parse(e.savedAt) || Number(id) || 0;
      const prevTs = prev ? Date.parse(prev.savedAt) || Number(prev.id) || 0 : 0;
      if (!prev || ts >= prevTs) map.set(id, e);
    }
    return [...map.values()].slice(0, 50);
  }

  function mergeActivity(local, server) {
    if (typeof ActivityTrack !== 'undefined' && ActivityTrack.mergeActivity) {
      return ActivityTrack.mergeActivity(local, server);
    }
    const map = new Map();
    for (const a of [...(server || []), ...(local || [])]) {
      if (!a || !a.id) continue;
      const prev = map.get(a.id);
      if (!prev || (a.ts || 0) >= (prev.ts || 0)) map.set(a.id, a);
    }
    return [...map.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 100);
  }

  function mergeStudyTime(local, server, activityLog) {
    if (typeof ActivityTrack !== 'undefined' && ActivityTrack.mergeStudyTime) {
      return ActivityTrack.mergeStudyTime(local, server, activityLog);
    }
    return local && typeof local === 'object' ? local : server || {};
  }

  window.mergeSyncPayload = function mergeSyncPayload(local, server) {
    const l = local && typeof local === 'object' ? local : {};
    const s = server && typeof server === 'object' ? server : {};
    const activityLog = mergeActivity(l.activityLog, s.activityLog);
    return {
      flashcards: mergeFlashcards(l.flashcards, s.flashcards),
      history: mergeHistory(l.history, s.history),
      savedExams: mergeSavedExams(l.savedExams, s.savedExams),
      activityLog,
      studyTime: mergeStudyTime(l.studyTime, s.studyTime, activityLog),
    };
  };
})();
