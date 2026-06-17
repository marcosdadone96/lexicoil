/**
 * Study activity log + time aggregates (lc_activity, lc_time).
 * Additive tracking — does not modify flashcards/history/savedExams merge.
 */
(function () {
  function dayKey(d) {
    return new Date(d).toISOString().slice(0, 10);
  }

  function monthKey(d) {
    return new Date(d).toISOString().slice(0, 7);
  }

  let _session = null;

  function defaultStudyTime() {
    const mk = monthKey(Date.now());
    return { streak: 0, lastActiveDay: '', monthKey: mk, monthSec: 0, totalSec: 0, byDay: {} };
  }

  function normalizeStudyTime(raw) {
    const t = raw && typeof raw === 'object' ? raw : {};
    const mk = monthKey(Date.now());
    const byDay = t.byDay && typeof t.byDay === 'object' ? { ...t.byDay } : {};
    const keys = Object.keys(byDay).sort();
    while (keys.length > 120) delete byDay[keys.shift()];
    let monthSec = Number(t.monthSec) || 0;
    if (t.monthKey !== mk) monthSec = 0;
    return {
      streak: Math.max(0, Number(t.streak) || 0),
      lastActiveDay: String(t.lastActiveDay || ''),
      monthKey: mk,
      monthSec,
      totalSec: Math.max(0, Number(t.totalSec) || 0),
      byDay,
    };
  }

  function recalcStreak(byDay, today) {
    let streak = 0;
    const d = new Date((today || dayKey(Date.now())) + 'T12:00:00');
    for (let i = 0; i < 400; i++) {
      const k = dayKey(d);
      if ((byDay[k] || 0) >= 60) streak++;
      else break;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function computeStudyTime(activityLog) {
    const byDay = {};
    (activityLog || []).forEach((a) => {
      const sec = Number(a.sec) || 0;
      if (sec < 30 || !a.day) return;
      byDay[a.day] = (byDay[a.day] || 0) + sec;
    });
    const today = dayKey(Date.now());
    const mk = monthKey(Date.now());
    let monthSec = 0;
    let totalSec = 0;
    Object.entries(byDay).forEach(([day, sec]) => {
      totalSec += sec;
      if (day.startsWith(mk)) monthSec += sec;
    });
    return {
      streak: recalcStreak(byDay, today),
      lastActiveDay: today,
      monthKey: mk,
      monthSec,
      totalSec,
      byDay,
    };
  }

  function normalizeActivityEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const ts = Number(entry.ts) || Date.now();
    const day = entry.day || dayKey(ts);
    return {
      id: String(entry.id || 'act_' + ts),
      ts,
      day,
      type: String(entry.type || 'study').slice(0, 24),
      goalId: entry.goalId ? String(entry.goalId) : null,
      label: String(entry.label || 'Study session').slice(0, 140),
      score: entry.score != null && !Number.isNaN(Number(entry.score)) ? Number(entry.score) : null,
      sec: Math.max(0, Math.round(Number(entry.sec) || 0)),
    };
  }

  function appendActivity(activityLog, entry) {
    const e = normalizeActivityEntry(entry);
    if (!e) return activityLog || [];
    const log = Array.isArray(activityLog) ? [...activityLog] : [];
    if (log.some((x) => x.id === e.id)) return log;
    log.unshift(e);
    return log.slice(0, 100);
  }

  function beginSession(type, goalId, label) {
    if (_session && _session.startedAt) flushSession();
    _session = {
      type: type || 'study',
      goalId: goalId || null,
      label: label || 'Study session',
      startedAt: Date.now(),
    };
  }

  function flushSession(extra) {
    if (!_session || !_session.startedAt) return null;
    const sec = Math.round((Date.now() - _session.startedAt) / 1000);
    const meta = {
      type: _session.type,
      goalId: _session.goalId,
      label: _session.label,
      sec,
      ...(extra && typeof extra === 'object' ? extra : {}),
    };
    _session = null;
    return meta;
  }

  function hasOpenSession() {
    return !!(_session && _session.startedAt);
  }

  function recordSession(state, meta) {
    const sec = Math.max(0, Math.round(Number(meta?.sec) || 0));
    if (sec < 30) return state;
    const activityLog = appendActivity(state.activityLog, {
      id: meta.id || 'act_' + Date.now(),
      ts: Date.now(),
      type: meta.type,
      goalId: meta.goalId,
      label: meta.label,
      score: meta.score,
      sec,
    });
    const studyTime = computeStudyTime(activityLog);
    return { activityLog, studyTime };
  }

  function formatDuration(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    if (s < 60) return s ? s + 's' : '0m';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? h + 'h ' + rm + 'm' : h + 'h';
  }

  function getStreak(state) {
    return normalizeStudyTime(state?.studyTime).streak;
  }

  function getMonthSec(state) {
    return normalizeStudyTime(state?.studyTime).monthSec;
  }

  function getTotalSec(state) {
    return normalizeStudyTime(state?.studyTime).totalSec;
  }

  function activityForGoal(activityLog, goal) {
    const log = Array.isArray(activityLog) ? activityLog : [];
    if (!goal) return log;
    return log.filter((a) => !a.goalId || a.goalId === goal.id);
  }

  function studySecForGoal(activityLog, goal) {
    return activityForGoal(activityLog, goal).reduce((sum, a) => sum + (Number(a.sec) || 0), 0);
  }

  function activityIcon(type) {
    if (type === 'exam' || type === 'quick') return '📝';
    if (type === 'vocab_quiz') return '⚡';
    if (type === 'flashcards') return '▭';
    if (type === 'oral') return '🎤';
    return '📖';
  }

  function mergeActivity(local, server) {
    const map = new Map();
    for (const raw of [...(server || []), ...(local || [])]) {
      const a = normalizeActivityEntry(raw);
      if (!a) continue;
      const prev = map.get(a.id);
      if (!prev || a.ts >= prev.ts) map.set(a.id, a);
    }
    return [...map.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 100);
  }

  function mergeStudyTime(local, server, mergedActivity) {
    if (Array.isArray(mergedActivity) && mergedActivity.length) {
      return computeStudyTime(mergedActivity);
    }
    const l = normalizeStudyTime(local);
    const s = normalizeStudyTime(server);
    const byDay = { ...s.byDay };
    Object.entries(l.byDay || {}).forEach(([day, sec]) => {
      byDay[day] = Math.max(byDay[day] || 0, sec);
    });
    const today = dayKey(Date.now());
    const mk = monthKey(Date.now());
    let monthSec = 0;
    let totalSec = 0;
    Object.entries(byDay).forEach(([day, sec]) => {
      totalSec += sec;
      if (day.startsWith(mk)) monthSec += sec;
    });
    return {
      streak: recalcStreak(byDay, today),
      lastActiveDay: [l.lastActiveDay, s.lastActiveDay].sort().pop() || today,
      monthKey: mk,
      monthSec,
      totalSec,
      byDay,
    };
  }

  window.ActivityTrack = {
    defaultStudyTime,
    normalizeStudyTime,
    computeStudyTime,
    beginSession,
    flushSession,
    hasOpenSession,
    recordSession,
    formatDuration,
    getStreak,
    getMonthSec,
    getTotalSec,
    activityForGoal,
    studySecForGoal,
    activityIcon,
    mergeActivity,
    mergeStudyTime,
  };
})();
