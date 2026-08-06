/**
 * VocabBatching — regulates how many saved words go into one generation.
 *
 * Solves both extremes the product needs:
 *   - TOO FEW words (or library can't satisfy the count) → caller routes to the
 *     Hören listening game instead of a full exam (see shouldUseGame).
 *   - TOO MANY words → split into module-sized batches, served on demand, with a
 *     coverage tracker so the user eventually practises ALL of them.
 *
 * Pure/stateless except for the plan object the caller persists per goal.
 * Prioritisation reuses AnalyticsStore weakness + least-recently-practised order.
 */
const VocabBatching = (() => {
  // How many target words fit naturally into one part of each module.
  const MODULE_CAPACITY = { lesen: 10, horen: 6, schreiben: 8, sprechen: 5 };
  /** Per minigame session caps (Feature 1). Personalized Lesen/Hören uses {@link capacityFor}. */
  const ACTIVITY_CAPACITY = Object.freeze({
    vocab_quiz: 10,
    listening_game: 6,
    vocab_phrases: 7,
  });
  const GAME_THRESHOLD = 4; // below this, a full exam doesn't make sense → game

  function activityStatsKey(activityKey, skills) {
    if (activityKey === 'personal') {
      const sk = (skills && skills.length ? skills : ['lesen']).slice().sort().join(',');
      return `personal:${sk}`;
    }
    return String(activityKey || 'vocab_quiz');
  }

  function capacityForActivity(activityKey, skills) {
    if (activityKey === 'personal') return capacityFor(skills);
    return ACTIVITY_CAPACITY[activityKey] || 10;
  }

  function migrateVocabPlanToActivity(goal, skills) {
    if (!goal?.vocabPlan || typeof goal.vocabPlan !== 'object') return;
    if (!goal.vocabActivityStats) goal.vocabActivityStats = {};
    const key = activityStatsKey('personal', skills);
    if (goal.vocabActivityStats[key]?.plan) return;
    goal.vocabActivityStats[key] = { v: 1, plan: goal.vocabPlan };
  }

  function buildActivityPlan(orderedWords, cap, skills) {
    const batches = [];
    for (let i = 0; i < orderedWords.length; i += cap) batches.push(orderedWords.slice(i, i + cap));
    const fp = `${orderedWords.length}:${orderedWords[0] || ''}:${orderedWords[orderedWords.length - 1] || ''}:${cap}`;
    return {
      v: 2,
      skills: skills && skills.length ? skills : ['lesen'],
      total: orderedWords.length,
      batchSize: cap,
      batches,
      covered: [],
      cursor: 0,
      fingerprint: fp,
      createdAt: Date.now(),
    };
  }

  function getActivityPlan(goal, activityKey, skills) {
    if (!goal?.vocabActivityStats) return null;
    const key = activityStatsKey(activityKey, skills);
    return goal.vocabActivityStats[key]?.plan || null;
  }

  function syncPersonalVocabPlan(goal, skills) {
    if (!goal) return null;
    migrateVocabPlanToActivity(goal, skills);
    const plan = getActivityPlan(goal, 'personal', skills);
    if (plan) goal.vocabPlan = plan;
    return plan;
  }

  /**
   * Pick the next word batch for a vocab activity (quiz, listening, phrases, personal exam).
   * Persists rotation state on goal.vocabActivityStats[activityKey].
   */
  function selectForActivity(words, activityKey, goal, opts = {}) {
    const skills = opts.skills;
    const cap = capacityForActivity(activityKey, skills);
    const list = [...new Set((words || []).map((w) => String(w || '').trim()).filter(Boolean))];
    if (!list.length) return { words: [], plan: null, cap, statsKey: null };
    if (!goal) return { words: list.slice(0, cap), plan: null, cap, statsKey: null };

    if (!goal.vocabActivityStats) goal.vocabActivityStats = {};
    const statsKey = activityStatsKey(activityKey, skills);
    if (!goal.vocabActivityStats[statsKey]) goal.vocabActivityStats[statsKey] = { v: 1 };

    const ordered = prioritise(list, goal);
    let plan = goal.vocabActivityStats[statsKey].plan;
    const fp = `${ordered.length}:${ordered[0] || ''}:${ordered[ordered.length - 1] || ''}:${cap}`;
    if (!plan || plan.fingerprint !== fp || plan.batchSize !== cap) {
      plan = buildActivityPlan(ordered, cap, skills);
      goal.vocabActivityStats[statsKey].plan = plan;
    }
    if (plan.cursor >= plan.batches.length && plan.batches.length > 0) {
      plan.cursor = 0;
      plan.covered = [];
    }
    let batch = nextBatch(plan);
    if (!batch) batch = ordered.slice(0, cap);
    if (activityKey === 'personal') goal.vocabPlan = plan;
    return { words: batch, plan, cap, statsKey };
  }

  function ensureCoveredPlan(goal, statsKey) {
    if (!goal.vocabActivityStats) goal.vocabActivityStats = {};
    if (!goal.vocabActivityStats[statsKey]) goal.vocabActivityStats[statsKey] = { v: 1 };
    let plan = goal.vocabActivityStats[statsKey].plan;
    if (!plan) {
      plan = {
        v: 1,
        covered: [],
        cursor: 0,
        batches: [],
        total: 0,
        batchSize: 0,
      };
      goal.vocabActivityStats[statsKey].plan = plan;
    }
    if (!Array.isArray(plan.covered)) plan.covered = [];
    return plan;
  }

  function recordActivityUsage(goal, activityKey, wordsUsed, opts = {}) {
    if (!goal) return;
    const skills = opts.skills;
    const statsKey = activityStatsKey(activityKey, skills);
    let plan = goal.vocabActivityStats?.[statsKey]?.plan;
    if (!plan && wordsUsed && wordsUsed.length) {
      plan = ensureCoveredPlan(goal, statsKey);
    }
    if (plan) advance(plan, wordsUsed);
    if (activityKey === 'personal') goal.vocabPlan = plan || goal.vocabPlan;
    if (typeof saveGoals === 'function') saveGoals();
  }

  function capacityFor(skills) {
    const arr = (skills && skills.length ? skills : ['lesen', 'horen']).map((s) => MODULE_CAPACITY[s] || 6);
    // Smallest module gates a combined exam; for single-skill it's just that one.
    return Math.max(3, Math.min(...arr));
  }

  /** Should we offer the listening game instead of generating an exam? Hören-only — never hijacks Lesen/other modules. */
  function shouldUseGame(words, skills, libraryMatchCount) {
    const skillList = skills && skills.length ? skills : ['lesen'];
    const horenOnly = skillList.length === 1 && skillList[0] === 'horen';
    if (!horenOnly) return false;
    const n = (words || []).length;
    if (n < GAME_THRESHOLD) return true;
    if (typeof libraryMatchCount === 'number' && libraryMatchCount < Math.min(n, 3)) {
      return true;
    }
    return false;
  }

  /**
   * Order words by priority: most-failed first, then least-recently practised,
   * then never-practised, then the rest. Falls back to given order if no stats.
   */
  function prioritise(words, goal) {
    const list = [...new Set(words || [])];
    const A = typeof AnalyticsStore !== 'undefined' ? AnalyticsStore : null;
    if (!A || !goal) return list;
    const score = (w) => {
      const stat = A.wordStat ? A.wordStat(goal, w) : null;
      if (!stat) return { fail: 1, seen: -1 }; // never practised → high priority
      const fail = stat.total ? 1 - stat.correct / stat.total : 1;
      return { fail, seen: stat.lastSeen || 0 };
    };
    return list
      .map((w) => ({ w, ...score(w) }))
      .sort((a, b) => b.fail - a.fail || a.seen - b.seen)
      .map((x) => x.w);
  }

  /** Build (or rebuild) a batching plan for a set of words. */
  function planBatches(words, skills, goal) {
    const ordered = prioritise(words, goal);
    const size = capacityFor(skills);
    const batches = [];
    for (let i = 0; i < ordered.length; i += size) batches.push(ordered.slice(i, i + size));
    return {
      v: 1,
      skills: skills && skills.length ? skills : ['lesen', 'horen'],
      total: ordered.length,
      batchSize: size,
      batches, // array of word[]
      covered: [], // words already practised across served batches
      cursor: 0, // next batch index (on-demand)
      createdAt: Date.now(),
    };
  }

  /** Next batch to generate (on-demand). Returns null when finished. */
  function nextBatch(plan) {
    if (!plan || plan.cursor >= plan.batches.length) return null;
    return plan.batches[plan.cursor];
  }

  /** Mark the current batch served (call after the exam/part is built). */
  function advance(plan, wordsActuallyUsed) {
    if (!plan) return plan;
    const used = wordsActuallyUsed && wordsActuallyUsed.length ? wordsActuallyUsed : plan.batches[plan.cursor] || [];
    const set = new Set([...(plan.covered || []), ...used]);
    plan.covered = [...set];
    plan.cursor = Math.min(plan.cursor + 1, plan.batches.length);
    return plan;
  }

  function coverage(plan) {
    if (!plan) return { done: 0, total: 0, ratio: 0, remaining: 0, finished: true };
    const total = plan.total || 0;
    const done = (plan.covered || []).length;
    return {
      done,
      total,
      ratio: total ? done / total : 0,
      remaining: Math.max(0, total - done),
      finished: plan.cursor >= plan.batches.length,
    };
  }

  /** Human summary for the UI, e.g. "Tanda 2/9 · 7 palabras · 14/60 practicadas". */
  function summary(plan, lang) {
    const c = coverage(plan);
    const cur = Math.min(plan.cursor + 1, plan.batches.length);
    const isES = String(lang || 'es').startsWith('es');
    return isES
      ? `Tanda ${cur}/${plan.batches.length} · ${c.done}/${c.total} palabras practicadas`
      : `Batch ${cur}/${plan.batches.length} · ${c.done}/${c.total} words covered`;
  }

  return {
    MODULE_CAPACITY,
    ACTIVITY_CAPACITY,
    GAME_THRESHOLD,
    capacityFor,
    capacityForActivity,
    activityStatsKey,
    migrateVocabPlanToActivity,
    getActivityPlan,
    syncPersonalVocabPlan,
    selectForActivity,
    recordActivityUsage,
    shouldUseGame,
    planBatches,
    nextBatch,
    advance,
    coverage,
    summary,
  };
})();

if (typeof window !== 'undefined') window.VocabBatching = VocabBatching;
if (typeof module !== 'undefined') module.exports = VocabBatching;
