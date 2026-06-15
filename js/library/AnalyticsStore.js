/* Grammar/vocabulary analytics from exam history — localStorage mastery profile (Phase 4) */
const AnalyticsStore = (() => {
  const KEY = 'lc_mastery';
  const MASTERY = Object.freeze({ weak: 70, solid: 85 });
  const DECAY_HALF_LIFE_DAYS = 30;
  const DEFAULT_MIN_ATTEMPTS = 2;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {
      /* ignore */
    }
    return { profiles: {} };
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
    if (typeof Auth !== 'undefined' && typeof Auth.pushSync === 'function') Auth.pushSync();
  }

  function profileKey(goal) {
    if (!goal) return 'global';
    return goal.id || `${goal.subject}_${goal.level}`;
  }

  function emptyProfile() {
    return {
      grammarTags: {},
      topicTags: {},
      vocabularyGaps: {},
      modules: {},
      itemStats: {},
      examsTaken: 0,
      lastUpdated: null,
    };
  }

  function getProfile(goal) {
    const data = load();
    const key = profileKey(goal);
    return data.profiles[key] || emptyProfile();
  }

  function decayStat(stat, factor) {
    if (!stat || !stat.total) return;
    const nextTotal = Math.round(stat.total * factor);
    const nextCorrect = Math.round(stat.correct * factor);
    if (nextTotal <= 0) {
      stat.correct = 0;
      stat.total = 0;
      stat.streak = 0;
      return;
    }
    stat.total = Math.max(1, nextTotal);
    stat.correct = Math.min(stat.total, Math.max(0, nextCorrect));
  }

  function decayMap(map, factor) {
    Object.values(map || {}).forEach((stat) => decayStat(stat, factor));
    Object.keys(map || {}).forEach((tag) => {
      if (!map[tag]?.total) delete map[tag];
    });
  }

  /** Half-life decay — older attempts weigh less without changing lc_mastery schema. */
  function applyTemporalDecay(profile, now = Date.now()) {
    if (!profile?.lastUpdated) return profile;
    const days = (now - profile.lastUpdated) / 86400000;
    if (days <= 0) return profile;
    const factor = 0.5 ** (days / DECAY_HALF_LIFE_DAYS);
    if (factor >= 0.999) return profile;
    decayMap(profile.grammarTags, factor);
    decayMap(profile.topicTags, factor);
    decayMap(profile.modules, factor);
    Object.entries(profile.vocabularyGaps || {}).forEach(([word, count]) => {
      const next = Math.round(count * factor);
      if (next <= 0) delete profile.vocabularyGaps[word];
      else profile.vocabularyGaps[word] = next;
    });
    return profile;
  }

  function bumpTag(map, tag, ok) {
    if (!tag) return;
    if (!map[tag]) map[tag] = { correct: 0, total: 0, streak: 0 };
    map[tag].total++;
    if (ok) {
      map[tag].correct++;
      map[tag].streak = (map[tag].streak || 0) + 1;
    } else {
      map[tag].streak = 0;
    }
  }

  function bumpModule(modules, mod, ok) {
    if (!mod) return;
    if (!modules[mod]) modules[mod] = { correct: 0, total: 0 };
    modules[mod].total++;
    if (ok) modules[mod].correct++;
  }

  function walkScorable(examData, fn) {
    if (!examData) return;
    if (typeof forEachGoetheQ === 'function') {
      forEachGoetheQ(examData, (mod, q) => fn(q, mod));
    }
    examData.horenParts?.forEach((p) => {
      p.segments?.forEach((seg, si) => {
        if (seg.question) fn({ ...seg, id: seg.id || `seg_${si}` }, 'horen');
      });
      p.noteFields?.forEach((f) => fn(f, 'note'));
    });
  }

  function scoreAnswer(q, user) {
    if (typeof goetheAnswersMatch === 'function') return goetheAnswersMatch(user, q.correct ?? q.correctAnswer);
    return user === (q.correct ?? q.correctAnswer);
  }

  function normalizeItemId(q) {
    const id = q?.origin?.bankId || q?.bankId || q?.id;
    if (!id) return null;
    return String(id).replace(/^ql_/, '');
  }

  function bumpItem(items, itemId, ok, meta = {}) {
    if (!itemId) return;
    if (!items[itemId]) items[itemId] = { correct: 0, total: 0, module: meta.module || null, teil: meta.teil ?? null };
    items[itemId].total++;
    if (ok) items[itemId].correct++;
    if (meta.module) items[itemId].module = meta.module;
    if (meta.teil != null) items[itemId].teil = meta.teil;
  }

  function computeTagStats(examData, answers) {
    const grammarTags = {};
    const topicTags = {};
    const modules = {};
    const itemStats = {};
    if (!examData) return { grammarTags, topicTags, modules, itemStats };

    const scoreQ = (q, mod) => {
      const ak = mod.includes('_') ? mod : `${mod}_${q.id}`;
      const user = answers?.[ak] ?? answers?.[`${mod}_${q.id}`];
      const ok = scoreAnswer(q, user);
      (q.grammarTags || []).forEach((t) => bumpTag(grammarTags, t, ok));
      (q.topicTags || []).forEach((t) => bumpTag(topicTags, t, ok));
      const modKey = String(mod).split('_')[0];
      bumpModule(modules, modKey, ok);
      const itemId = normalizeItemId(q);
      bumpItem(itemStats, itemId, ok, { module: modKey, teil: q.teil });
    };

    walkScorable(examData, scoreQ);
    return { grammarTags, topicTags, modules, itemStats };
  }

  function mergeItemMaps(profileMap, delta) {
    Object.entries(delta || {}).forEach(([itemId, stat]) => {
      if (!profileMap[itemId]) profileMap[itemId] = { correct: 0, total: 0, module: stat.module || null, teil: stat.teil ?? null };
      profileMap[itemId].correct += stat.correct || 0;
      profileMap[itemId].total += stat.total || 0;
      if (stat.module) profileMap[itemId].module = stat.module;
      if (stat.teil != null) profileMap[itemId].teil = stat.teil;
    });
  }

  function mergeTagMaps(profileMap, delta) {
    Object.entries(delta).forEach(([tag, stat]) => {
      if (!profileMap[tag]) profileMap[tag] = { correct: 0, total: 0, streak: 0 };
      profileMap[tag].correct += stat.correct;
      profileMap[tag].total += stat.total;
      profileMap[tag].streak = stat.streak ?? profileMap[tag].streak;
    });
  }

  function mergeModuleMaps(profileMap, delta) {
    Object.entries(delta).forEach(([mod, stat]) => {
      if (!profileMap[mod]) profileMap[mod] = { correct: 0, total: 0 };
      profileMap[mod].correct += stat.correct;
      profileMap[mod].total += stat.total;
    });
  }

  function recordWordResults(goal, detail) {
    if (!goal || !Array.isArray(detail)) return;
    const data = load();
    const key = profileKey(goal);
    const profile = data.profiles[key] || emptyProfile();
    applyTemporalDecay(profile);
    detail.forEach((d) => {
      if (d?.word) bumpTag(profile.grammarTags, 'vocab:' + d.word, !!d.correct);
    });
    profile.lastUpdated = Date.now();
    data.profiles[key] = profile;
    save(data);
  }

  function recordExamResult(goal, entry, examData, answers) {
    const data = load();
    const key = profileKey(goal);
    const profile = data.profiles[key] || emptyProfile();
    applyTemporalDecay(profile);
    const tagStats = computeTagStats(examData, answers);

    mergeTagMaps(profile.grammarTags, tagStats.grammarTags);
    mergeTagMaps(profile.topicTags, tagStats.topicTags);
    mergeModuleMaps(profile.modules, tagStats.modules);
    mergeItemMaps(profile.itemStats, tagStats.itemStats);

    (entry?.savedWords || []).forEach((w) => {
      if (!profile.vocabularyGaps[w]) profile.vocabularyGaps[w] = 0;
      profile.vocabularyGaps[w]++;
    });

    profile.examsTaken++;
    profile.lastUpdated = Date.now();
    data.profiles[key] = profile;
    save(data);
    return tagStats;
  }

  function tagAccuracy(stat) {
    if (!stat?.total) return 100;
    return Math.round((stat.correct / stat.total) * 100);
  }

  function masteryLevel(stat, minAttempts = DEFAULT_MIN_ATTEMPTS) {
    if (!stat?.total || stat.total < minAttempts) return 'unknown';
    const acc = tagAccuracy(stat);
    if (acc < MASTERY.weak) return 'weak';
    if (acc < MASTERY.solid) return 'developing';
    return 'solid';
  }

  function confidenceFor(stat, minAttempts = DEFAULT_MIN_ATTEMPTS) {
    if (!stat?.total) return 'none';
    if (stat.total < minAttempts) return 'low';
    if (stat.total < minAttempts * 2) return 'medium';
    return 'high';
  }

  function rankedWeakTags(tagMap, limit = 3, minAttempts = DEFAULT_MIN_ATTEMPTS) {
    return Object.entries(tagMap || {})
      .filter(([, s]) => s.total >= minAttempts)
      .map(([tag, s]) => ({
        tag,
        accuracy: tagAccuracy(s),
        total: s.total,
        mastery: masteryLevel(s, minAttempts),
        confidence: confidenceFor(s, minAttempts),
      }))
      .filter((x) => x.accuracy < MASTERY.weak)
      .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
      .slice(0, limit);
  }

  function rankedTagsByMastery(tagMap, limit = 5, minAttempts = DEFAULT_MIN_ATTEMPTS) {
    return Object.entries(tagMap || {})
      .filter(([, s]) => s.total > 0)
      .map(([tag, s]) => ({
        tag,
        accuracy: tagAccuracy(s),
        total: s.total,
        mastery: masteryLevel(s, minAttempts),
        confidence: confidenceFor(s, minAttempts),
      }))
      .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
      .slice(0, limit);
  }

  function getWeakGrammarTags(goal, limit = 3) {
    return rankedWeakTags(getProfile(goal).grammarTags, limit).map((x) => x.tag);
  }

  function getWeakTopicTags(goal, limit = 3) {
    return rankedWeakTags(getProfile(goal).topicTags, limit).map((x) => x.tag);
  }

  function getWeakModules(goal, limit = 3) {
    const profile = getProfile(goal);
    return Object.entries(profile.modules || {})
      .filter(([, s]) => s.total >= DEFAULT_MIN_ATTEMPTS)
      .map(([mod, s]) => ({
        module: mod,
        accuracy: tagAccuracy(s),
        total: s.total,
        mastery: masteryLevel(s),
        confidence: confidenceFor(s),
      }))
      .filter((x) => x.accuracy < MASTERY.weak)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, limit);
  }

  function getModulePerformance(goal) {
    const profile = getProfile(goal);
    return Object.entries(profile.modules || {})
      .filter(([, s]) => s.total > 0)
      .map(([mod, s]) => ({
        module: mod,
        accuracy: tagAccuracy(s),
        total: s.total,
        mastery: masteryLevel(s),
        confidence: confidenceFor(s),
      }))
      .sort((a, b) => a.accuracy - b.accuracy);
  }

  function getVocabularyGaps(goal, limit = 10) {
    const profile = getProfile(goal);
    return Object.entries(profile.vocabularyGaps || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  }

  function getMasterySummary(goal, opts = {}) {
    const minAttempts = opts.minAttempts ?? DEFAULT_MIN_ATTEMPTS;
    const p = getProfile(goal);
    const weakGrammar = rankedWeakTags(p.grammarTags, 5, minAttempts);
    const weakTopics = rankedWeakTags(p.topicTags, 5, minAttempts);
    const grammarOverview = rankedTagsByMastery(p.grammarTags, 8, minAttempts);
    return {
      examsTaken: p.examsTaken,
      lastUpdated: p.lastUpdated,
      minAttempts,
      weakGrammar,
      weakTopics,
      weakModules: getWeakModules(goal, 5),
      grammarOverview,
      modulePerformance: getModulePerformance(goal),
      vocabularyGaps: getVocabularyGaps(goal, 5),
      hasData: p.examsTaken > 0,
    };
  }

  function exportSnapshot() {
    return load();
  }

  function replaceSnapshot(snapshot) {
    const data = snapshot && typeof snapshot === 'object' ? snapshot : { profiles: {} };
    if (!data.profiles || typeof data.profiles !== 'object') data.profiles = {};
    save(data);
    return data;
  }

  function mergeProfiles(local, server) {
    const out = { profiles: {} };
    const keys = new Set([
      ...Object.keys(local?.profiles || {}),
      ...Object.keys(server?.profiles || {}),
    ]);
    keys.forEach((key) => {
      const a = local?.profiles?.[key];
      const b = server?.profiles?.[key];
      if (!a && !b) return;
      if (!a) {
        out.profiles[key] = JSON.parse(JSON.stringify(b));
        return;
      }
      if (!b) {
        out.profiles[key] = JSON.parse(JSON.stringify(a));
        return;
      }
      const merged = emptyProfile();
      merged.examsTaken = Math.max(a.examsTaken || 0, b.examsTaken || 0);
      merged.lastUpdated = Math.max(a.lastUpdated || 0, b.lastUpdated || 0);
      const mergeTags = (target, left, right) => {
        const tags = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
        tags.forEach((tag) => {
          const l = left?.[tag];
          const r = right?.[tag];
          if (!l && r) target[tag] = { ...r };
          else if (l && !r) target[tag] = { ...l };
          else {
            target[tag] = {
              correct: (l.correct || 0) + (r.correct || 0),
              total: (l.total || 0) + (r.total || 0),
              streak: Math.max(l.streak || 0, r.streak || 0),
            };
          }
        });
      };
      mergeTags(merged.grammarTags, a.grammarTags, b.grammarTags);
      mergeTags(merged.topicTags, a.topicTags, b.topicTags);
      mergeTags(merged.modules, a.modules, b.modules);
      const mergeItems = (target, left, right) => {
        const ids = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
        ids.forEach((id) => {
          const l = left?.[id];
          const r = right?.[id];
          if (!l && r) target[id] = { ...r };
          else if (l && !r) target[id] = { ...l };
          else {
            target[id] = {
              correct: (l.correct || 0) + (r.correct || 0),
              total: (l.total || 0) + (r.total || 0),
              module: r.module || l.module || null,
              teil: r.teil ?? l.teil ?? null,
            };
          }
        });
      };
      mergeItems(merged.itemStats, a.itemStats, b.itemStats);
      const gaps = new Set([
        ...Object.keys(a.vocabularyGaps || {}),
        ...Object.keys(b.vocabularyGaps || {}),
      ]);
      gaps.forEach((word) => {
        merged.vocabularyGaps[word] = (a.vocabularyGaps?.[word] || 0) + (b.vocabularyGaps?.[word] || 0);
      });
      out.profiles[key] = merged;
    });
    return out;
  }

  return {
    KEY,
    load,
    getProfile,
    computeTagStats,
    recordExamResult,
    recordWordResults,
    getWeakGrammarTags,
    getWeakTopicTags,
    getWeakModules,
    getModulePerformance,
    getVocabularyGaps,
    getMasterySummary,
    exportSnapshot,
    replaceSnapshot,
    mergeProfiles,
    applyTemporalDecay,
    tagAccuracy,
    masteryLevel,
    confidenceFor,
    MASTERY,
    DECAY_HALF_LIFE_DAYS,
    DEFAULT_MIN_ATTEMPTS,
  };
})();

if (typeof window !== 'undefined') window.AnalyticsStore = AnalyticsStore;
if (typeof module !== 'undefined') module.exports = AnalyticsStore;
