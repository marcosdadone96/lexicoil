/* Personalized weakness exams — 70% weak tags / 30% mixed (Phase 5) */
const WeaknessEngine = (() => {
  const WEAK_RATIO = 0.7;
  const DEFAULT_SEEN_K = 3;

  function analyticsEngine() {
    if (typeof AnalyticsStore !== 'undefined') return AnalyticsStore;
    if (typeof globalThis !== 'undefined' && globalThis.AnalyticsStore) return globalThis.AnalyticsStore;
    if (typeof window !== 'undefined' && window.AnalyticsStore) return window.AnalyticsStore;
    return null;
  }

  function goalStoreEngine() {
    if (typeof GoalStore !== 'undefined') return GoalStore;
    if (typeof globalThis !== 'undefined' && globalThis.GoalStore) return globalThis.GoalStore;
    return null;
  }

  async function getWeakTags(goal, limit = 5) {
    const tags = [];
    const Analytics = analyticsEngine();
    if (Analytics) {
      tags.push(...Analytics.getWeakGrammarTags(goal, limit));
      if (tags.length < limit) {
        const topics = Analytics.getWeakTopicTags(goal, limit - tags.length);
        tags.push(...topics.map((t) => `topic:${t}`));
      }
    }
    if (tags.length) return tags.slice(0, limit);
    if (typeof getWeakAreasForGoal === 'function' && goal) {
      const legacy = getWeakAreasForGoal(goal);
      return legacy.filter((x) => x.startsWith('g-')).slice(0, limit);
    }
    return [];
  }

  function splitWeakTags(tags) {
    const grammarTags = [];
    const topicTags = [];
    (tags || []).forEach((t) => {
      if (String(t).startsWith('topic:')) topicTags.push(String(t).slice(6));
      else grammarTags.push(t);
    });
    return { grammarTags, topicTags };
  }

  function tagFamily(tag) {
    const parts = String(tag || '').split('-');
    if (parts.length >= 3 && parts[0] === 'g') return parts.slice(0, 3).join('-');
    return String(tag || '');
  }

  function matchesTags(q, grammarTags, topicTags, relaxed = false) {
    const matchFn =
      typeof ExamBuilder !== 'undefined' ? ExamBuilder.questionMatchesTags.bind(ExamBuilder) : null;
    if (matchFn && matchFn(q, grammarTags, topicTags)) return true;
    if (!relaxed || !grammarTags.length) return false;
    const families = grammarTags.map(tagFamily);
    return (q.grammarTags || []).some((t) => families.some((f) => t.startsWith(f) || tagFamily(t) === f));
  }

  function seenIdsForGoal(goal) {
    const GS = goalStoreEngine();
    if (GS?.seenQuestionIds) return GS.seenQuestionIds(goal);
    const exams = goal?.seenExams || [];
    return new Set(exams.flatMap((e) => e.questionIds || []));
  }

  function recordSeen(goal, questionIds) {
    const GS = goalStoreEngine();
    if (GS?.recordSeenQuestions) {
      GS.recordSeenQuestions(goal, questionIds);
    } else if (goal && questionIds?.length) {
      const exams = [{ at: Date.now(), questionIds: [...new Set(questionIds)] }, ...(goal.seenExams || [])];
      goal.seenExams = exams.slice(0, DEFAULT_SEEN_K);
    }
  }

  function bpEngine() {
    if (typeof ExamBlueprint !== 'undefined') return ExamBlueprint;
    if (typeof globalThis !== 'undefined' && globalThis.ExamBlueprint) return globalThis.ExamBlueprint;
    if (typeof window !== 'undefined' && window.ExamBlueprint) return window.ExamBlueprint;
    return null;
  }

  function builderEngine() {
    if (typeof ExamBuilder !== 'undefined') return ExamBuilder;
    if (typeof globalThis !== 'undefined' && globalThis.ExamBuilder) return globalThis.ExamBuilder;
    if (typeof window !== 'undefined' && window.ExamBuilder) return window.ExamBuilder;
    return null;
  }

  function loaderEngine() {
    if (typeof LibraryLoader !== 'undefined') return LibraryLoader;
    if (typeof globalThis !== 'undefined' && globalThis.LibraryLoader) return globalThis.LibraryLoader;
    return null;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function slotCandidates(pool, partSpec, used, seen) {
    const BP = bpEngine();
    let candidates = pool.filter((q) => q?.id && !used.has(q.id) && !seen.has(q.id));
    const teil = partSpec.teil;
    if (teil != null) {
      const byTeil = candidates.filter((q) => (q.teil || q.part) === teil);
      if (byTeil.length) candidates = byTeil;
    }
    if (partSpec.estimatedExamPart) {
      const bySlot = candidates.filter(
        (q) => q.estimatedExamPart === partSpec.estimatedExamPart || q.slot === partSpec.estimatedExamPart,
      );
      if (bySlot.length) candidates = bySlot;
    }
    if (BP?.typeAllowed) {
      candidates = candidates.filter((q) => BP.typeAllowed(q, partSpec.questionTypes));
    }
    return candidates;
  }

  function pickOne(candidates, preferWeak, grammarTags, topicTags, relaxed) {
    if (!candidates.length) return null;
    if (preferWeak) {
      const weak = candidates.filter((q) => matchesTags(q, grammarTags, topicTags, relaxed));
      if (weak.length) return shuffle(weak)[0];
    } else {
      const mixed = candidates.filter((q) => !matchesTags(q, grammarTags, topicTags, false));
      if (mixed.length) return shuffle(mixed)[0];
    }
    return shuffle(candidates)[0];
  }

  function assemble7030(bank, blueprint, { grammarTags, topicTags, seen = new Set(), weakRatio = WEAK_RATIO }) {
    const BP = bpEngine();
    if (!BP?.enumeratePartSlots || !BP.finalizeAssembly) {
      throw new Error('ExamBlueprint personalized assembly not available');
    }

    const slots = BP.enumeratePartSlots(blueprint);
    const totalItems = slots.length;
    const nWeak = Math.round(weakRatio * totalItems);
    let weakAssigned = 0;
    let relaxed = false;
    const used = new Set();
    const bucketKey = (modId, partSpec) => `${modId}:${partSpec.teil}:${partSpec.slotType || ''}`;
    const buckets = new Map();

    const tryFill = () => {
      weakAssigned = 0;
      used.clear();
      buckets.clear();
      for (const slot of slots) {
        const pool = BP.modulePool(bank, slot.modId);
        let candidates = slotCandidates(pool, slot.partSpec, used, seen);
        let preferWeak = weakAssigned < nWeak;
        let q = pickOne(candidates, preferWeak, grammarTags, topicTags, relaxed);
        if (preferWeak && !q && !relaxed) {
          q = pickOne(candidates, true, grammarTags, topicTags, true);
        }
        if (!q) {
          candidates = slotCandidates(pool, slot.partSpec, used, seen);
          q = pickOne(candidates, false, grammarTags, topicTags, relaxed);
        }
        if (!q) {
          const fallback = pool.filter((item) => item?.id && !used.has(item.id) && !seen.has(item.id));
          q = fallback.length ? shuffle(fallback)[0] : null;
        }
        if (!q) continue;

        const isWeak = matchesTags(q, grammarTags, topicTags, relaxed);
        const origin = preferWeak && isWeak && weakAssigned < nWeak ? 'weakness' : 'mixed';
        if (origin === 'weakness') weakAssigned++;
        used.add(q.id);
        const tagged = { ...q, origin };

        const key = bucketKey(slot.modId, slot.partSpec);
        if (!buckets.has(key)) buckets.set(key, { modId: slot.modId, partSpec: slot.partSpec, picked: [] });
        buckets.get(key).picked.push(tagged);
      }
    };

    tryFill();
    if (weakAssigned < nWeak && grammarTags.length) {
      relaxed = true;
      tryFill();
    }

    const partEntries = [...buckets.values()];
    const assembled = BP.finalizeAssembly(bank, blueprint, partEntries);
    const weakCount = assembled.selected.filter((q) => q.origin === 'weakness').length;
    const scorable = assembled.selected.length;
    const weaknessRatioTarget = weakRatio;
    const weaknessRatioActual = scorable ? weakCount / scorable : 0;

    return {
      ...assembled,
      personalizedSplit: {
        targetWeak: nWeak,
        actualWeak: weakCount,
        total: scorable,
        weaknessRatioTarget,
        weaknessRatioActual,
        relaxed,
        tags: { grammarTags, topicTags },
      },
    };
  }

  function buildPersonalizedExam(goal, blueprint, bank, options = {}) {
    const weakTags = options.grammarTags?.length
      ? splitWeakTags([...(options.grammarTags || []), ...(options.topicTags || []).map((t) => `topic:${t}`)])
      : splitWeakTags(options.weakTags || []);

    let { grammarTags, topicTags } = weakTags;
    if (!grammarTags.length && !topicTags.length && goal) {
      throw new Error('No weak tags available for personalized exam');
    }

    const seen = new Set([
      ...(options.seenIds || seenIdsForGoal(goal)),
      ...(typeof BurnedRegistry !== 'undefined' ? BurnedRegistry.excludeSets().excludeIds : []),
    ]);
    const assembled = assemble7030(bank, blueprint, {
      grammarTags,
      topicTags,
      seen,
      weakRatio: options.weakRatio ?? WEAK_RATIO,
    });

    const lang = bank.meta?.language || goal?.subject || 'de';
    const level = bank.meta?.level || goal?.level || 'B1';
    const Builder = builderEngine();
    if (!Builder) throw new Error('ExamBuilder not loaded');

    const exam = Builder.buildFromBlueprint(lang, level, bank, blueprint, {
      mode: 'personalized',
      grammarTags,
      topicTags,
      assembled,
      personalizedSplit: assembled.personalizedSplit,
      skills: options.skills,
    });

    exam.personalizedExam = true;
    exam.personalizedSplit = assembled.personalizedSplit;
    exam.weaknessExam = true;

    const ids = assembled.selected.map((q) => q.id).filter(Boolean);
    if (goal && ids.length) recordSeen(goal, ids);

    return exam;
  }

  async function prepareBank(lang, level) {
    const Loader = loaderEngine();
    if (!Loader) throw new Error('LibraryLoader not loaded');
    let bank = await Loader.load(lang, level);
    if (typeof TaggingGate !== 'undefined') {
      const gate = TaggingGate.gateBank(bank);
      if (!gate.passed) {
        const err = new Error(`Tagging gate failed: ${gate.trusted}/${gate.total} trusted questions`);
        err.code = 'tagging_gate_failed';
        throw err;
      }
      bank = { ...bank, questions: gate.trustedQuestions };
    }
    return bank;
  }

  async function buildWeaknessExam(lang, level, goal, options = {}) {
    const bank = await prepareBank(lang, level);
    const BP = bpEngine();
    const blueprint =
      BP && BP.hasBlueprint(lang, level) ? await BP.load(lang, level) : null;

    if (blueprint) {
      const weakTags = await getWeakTags(goal, options.limit || 5);
      const split = splitWeakTags(weakTags);
      if (split.grammarTags.length || split.topicTags.length) {
        return buildPersonalizedExam(goal, blueprint, bank, {
          ...options,
          grammarTags: options.grammarTags || split.grammarTags,
          topicTags: options.topicTags || split.topicTags,
        });
      }
    }

    const weakTags = options.grammarTags?.length
      ? { grammarTags: options.grammarTags, topicTags: options.topicTags || [] }
      : splitWeakTags(await getWeakTags(goal, options.limit || 3));

    const { grammarTags, topicTags } = weakTags;
    const buildOpts = { ...options, topicTags };

    if (!grammarTags.length && !topicTags.length) {
      const Builder = builderEngine();
      return blueprint
        ? Builder.buildFromBlueprint(lang, level, bank, blueprint, { mode: 'standard', ...buildOpts })
        : Builder.build(lang, level, bank, { mode: 'standard', ...buildOpts });
    }

    const weaknessOpts = { mode: 'weakness', grammarTags, ...buildOpts };
    const Builder = builderEngine();
    return blueprint
      ? Builder.buildFromBlueprint(lang, level, bank, blueprint, weaknessOpts)
      : Builder.build(lang, level, bank, weaknessOpts);
  }

  return {
    getWeakTags,
    splitWeakTags,
    assemble7030,
    buildPersonalizedExam,
    buildWeaknessExam,
    matchesTags,
    WEAK_RATIO,
  };
})();

if (typeof window !== 'undefined') window.WeaknessEngine = WeaknessEngine;
if (typeof module !== 'undefined') module.exports = WeaknessEngine;
