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
  const GAME_THRESHOLD = 4; // below this, a full exam doesn't make sense → game

  function capacityFor(skills) {
    const arr = (skills && skills.length ? skills : ['lesen', 'horen']).map((s) => MODULE_CAPACITY[s] || 6);
    // Smallest module gates a combined exam; for single-skill it's just that one.
    return Math.max(3, Math.min(...arr));
  }

  /** Should we offer the listening game instead of generating an exam? */
  function shouldUseGame(words, skills, libraryMatchCount) {
    const n = (words || []).length;
    if (n < GAME_THRESHOLD) return true;
    // Asked for more words than the library can place, and only listening selected.
    if (typeof libraryMatchCount === 'number' && libraryMatchCount < Math.min(n, 3)) {
      const onlyListening = (skills || []).length === 1 && skills[0] === 'horen';
      if (onlyListening) return true;
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
    GAME_THRESHOLD,
    capacityFor,
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
