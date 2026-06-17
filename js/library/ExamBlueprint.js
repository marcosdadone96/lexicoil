/**
 * Exam Blueprint — fixed official-like structure, dynamic library content.
 * Principle: structure is locked; questions/passages are selected from the bank.
 */
const ExamBlueprint = (() => {
  const INDEX = (() => {
    if (typeof LibraryCatalog !== 'undefined') return LibraryCatalog.buildBlueprintIndex();
    const idx = {};
    for (const lang of ['de', 'en', 'es']) {
      const type = lang === 'de' ? 'goethe' : lang === 'es' ? 'dele' : 'cambridge';
      for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
        idx[`${lang}_${level}`] = `${type}_${level}`;
      }
    }
    return idx;
  })();
  const CACHE = {};

  function key(lang, level) {
    return `${lang}_${level}`;
  }

  function blueprintPath(lang, level) {
    const id = INDEX[key(lang, level)];
    return id ? `library/blueprints/${id}.json` : null;
  }

  function hasBlueprint(lang, level) {
    return !!INDEX[key(lang, level)];
  }

  async function load(lang, level) {
    const k = key(lang, level);
    if (CACHE[k]) return CACHE[k];
    const path = blueprintPath(lang, level);
    if (!path) return null;
    const res = await fetch(path);
    if (!res.ok) return null;
    CACHE[k] = await res.json();
    return CACHE[k];
  }

  function loadSync(lang, level) {
    return CACHE[key(lang, level)] || null;
  }

  function cacheBlueprint(lang, level, blueprint) {
    CACHE[key(lang, level)] = blueprint;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function normType(q) {
    const t = String(q.questionType || q.type || '').toLowerCase();
    if (t === 'multiple') return 'multiple_choice';
    if (t === 'match') return 'matching';
    if (t === 'richtig_falsch') return 'true_false';
    return t;
  }

  function normToken(x) {
    const t = String(x || '').toLowerCase();
    if (t === 'multiple') return 'multiple_choice';
    if (t === 'match') return 'matching';
    if (t === 'richtig_falsch' || t === 'true_false') return 'true_false';
    return t;
  }

  function typeAllowed(q, allowed) {
    if (!allowed?.length) return true;
    const t = normType(q);
    return allowed.some((a) => normToken(a) === t);
  }

  function modulePool(bank, moduleId) {
    const mod = String(moduleId).toLowerCase();
    return (bank.questions || []).filter((q) => {
      const m = String(q.module || '').toLowerCase();
      if (mod === 'lesen' || mod === 'reading') return m === 'lesen' || m === 'reading';
      if (mod === 'horen' || mod === 'listening') return m === 'horen' || m === 'listening';
      if (mod === 'grammatik' || mod === 'use_of_english') {
        return m === 'grammatik' || m === 'grammar' || m === 'use_of_english';
      }
      if (mod === 'schreiben' || mod === 'writing') return m === 'schreiben' || m === 'writing';
      return m === mod;
    });
  }

  function passageIdOf(q) {
    if (typeof PassageResolver !== 'undefined') return PassageResolver.passageIdFromQuestion(q);
    return q?.passageId || q?.context?.passageId || null;
  }

  function groupCandidatesByPassage(candidates) {
    const byPassage = new Map();
    candidates.forEach((q) => {
      const pid = passageIdOf(q);
      if (!pid) return;
      if (!byPassage.has(pid)) byPassage.set(pid, []);
      byPassage.get(pid).push(q);
    });
    return byPassage;
  }

  /** Pick questions from one passage (Teil 1/5) or a matched pair (Teil 2). */
  function pickPassageAligned(candidates, partSpec, target) {
    const layout = partSpec.layout || '';
    if (layout !== 'passage_questions' || !candidates.length) return null;

    const byPassage = groupCandidatesByPassage(candidates);
    const passagesPerPart = partSpec.passagesPerPart || 1;

    if (passagesPerPart >= 2) {
      const sets = new Map();
      for (const [pid, qs] of byPassage) {
        const m = String(pid).match(/^(.+)-([ab])$/i);
        if (!m) continue;
        const base = m[1];
        if (!sets.has(base)) sets.set(base, { qa: [], qb: [] });
        const slot = m[2].toLowerCase() === 'a' ? 'qa' : 'qb';
        sets.get(base)[slot].push(...qs);
      }
      const pairs = [...sets.values()].filter((s) => s.qa.length && s.qb.length && s.qa.length + s.qb.length >= target);
      if (pairs.length) {
        const pair = shuffle(pairs)[0];
        return shuffle([...pair.qa, ...pair.qb]).slice(0, target);
      }
      const pids = [...byPassage.entries()].sort((a, b) => b[1].length - a[1].length);
      if (pids.length >= 2 && pids[0][1].length + pids[1][1].length >= target) {
        return shuffle([...pids[0][1], ...pids[1][1]]).slice(0, target);
      }
      return null;
    }

    const viable = [...byPassage.entries()].filter(([, qs]) => qs.length >= target);
    if (!viable.length) return null;
    const [, qs] = shuffle(viable)[0];
    return shuffle(qs).slice(0, target);
  }

  function pickFromPool(pool, partSpec, used, bank, filterFn, opts = {}) {
    const teil = partSpec.teil;
    const target = partSpec.itemsTotal || partSpec.questionsTotal?.max || partSpec.questionsTotal?.min || 4;
    let candidates = pool.filter(
      (q) =>
        !used.has(q.id) &&
        !(opts.excludeIds && opts.excludeIds.has(q.id)) &&
        !(opts.applyBurned !== false && typeof BurnedRegistry !== 'undefined' && BurnedRegistry.isBankQuestionBurned(bank, q)),
    );
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
    candidates = candidates.filter((q) => typeAllowed(q, partSpec.questionTypes));
    if (filterFn) candidates = candidates.filter(filterFn);
    if (!candidates.length) {
      candidates = pool.filter(
        (q) =>
          !used.has(q.id) &&
          !(opts.excludeIds && opts.excludeIds.has(q.id)) &&
          !(opts.applyBurned !== false && typeof BurnedRegistry !== 'undefined' && BurnedRegistry.isBankQuestionBurned(bank, q)) &&
          typeAllowed(q, partSpec.questionTypes),
      );
      if (filterFn) candidates = candidates.filter(filterFn);
    }
    const modId = opts.moduleId || partSpec.moduleId || null;
    const calibration = opts.calibration;
    const IC = typeof ItemCalibration !== 'undefined' ? ItemCalibration : null;
    let picked = pickPassageAligned(candidates, partSpec, target);
    if (!picked?.length) {
      if (calibration && IC && candidates.length > target) {
        picked = IC.pickCalibrated(candidates, target, {
          module: modId || inferModuleFromPool(pool),
          teil,
          calibration,
          shuffleFn: shuffle,
        });
      } else {
        picked = shuffle(candidates).slice(0, target);
      }
    }
    picked.forEach((q) => used.add(q.id));
    return picked;
  }

  function inferModuleFromPool(pool) {
    const q = pool?.[0];
    return q?.module || null;
  }

  function getPassage(bank, passageId) {
    if (typeof PassageResolver !== 'undefined') {
      return PassageResolver.getPassageFromBank(bank, passageId);
    }
    return (bank.passages || []).find((p) => p.id === passageId) || null;
  }

  function resolvePassage(bank, q) {
    if (typeof PassageResolver !== 'undefined') {
      return PassageResolver.resolvePassageForQuestion(bank, q);
    }
    const pid = q.passageId || q.context?.passageId;
    return pid ? getPassage(bank, pid) : null;
  }

  function groupByPassage(questions, bank) {
    const enriched =
      typeof PassageResolver !== 'undefined'
        ? PassageResolver.enrichQuestionPassageIds(questions)
        : questions;
    const groups = new Map();
    enriched.forEach((q) => {
      const pid =
        (typeof PassageResolver !== 'undefined'
          ? PassageResolver.passageIdFromQuestion(q)
          : q.passageId) || `_solo_${q.id}`;
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid).push(q);
    });
    return { groups, enriched };
  }

  function toExamQuestion(q, idx) {
    const out = {
      id: `ql_${q.id || idx}`,
      type: q.type || 'multiple',
      question: q.question,
      correct: q.correct != null ? q.correct : q.correctAnswer,
      correctAnswer: q.correctAnswer != null ? q.correctAnswer : q.correct,
      explanation: q.explanation || '',
      grammarTags: q.grammarTags || [],
      topicTags: q.topicTags || [],
      vocabularyTags: q.vocabularyTags || [],
      difficulty: q.difficulty,
    };
    if (q.options?.length) out.options = [...q.options];
    if (q.signText) out.signText = q.signText;
    if (q.origin) out.origin = q.origin;
    return out;
  }

  function adsMatching() {
    if (typeof AdsMatching !== 'undefined') return AdsMatching;
    if (typeof globalThis !== 'undefined' && globalThis.AdsMatching) return globalThis.AdsMatching;
    if (typeof window !== 'undefined' && window.AdsMatching) return window.AdsMatching;
    return null;
  }

  function buildLesenPart(partSpec, questions, bank) {
    const layout = partSpec.layout || 'passage_questions';
    const { groups, enriched } = groupByPassage(questions, bank);
    const sharedPassage =
      typeof PassageResolver !== 'undefined'
        ? PassageResolver.resolvePassageForQuestions(bank, enriched)
        : null;

    const part = {
      teil: partSpec.teil,
      instruction: partSpec.instruction || partSpec.label,
      blueprintSlot: partSpec.slotType,
    };

    const AM = adsMatching();
    if (AM?.isAdsMatchingSpec(partSpec) && enriched.length) {
      return AM.buildAdsMatchingLesenPart(partSpec, enriched, toExamQuestion);
    }

    if (layout === 'items' && enriched.length) {
      part.items = enriched.map((q, i) => {
        const passage = resolvePassage(bank, q) || sharedPassage;
        const eq = toExamQuestion(q, i);
        const pid =
          typeof PassageResolver !== 'undefined'
            ? PassageResolver.passageIdFromQuestion(q)
            : q.passageId;
        return {
          id: eq.id,
          type: eq.type,
          signText: passage?.text || q.signText || q.text || '',
          passageId: pid || passage?.id || undefined,
          question: q.question,
          options: eq.options,
          correct: eq.correct,
          grammarTags: eq.grammarTags,
          topicTags: eq.topicTags,
          vocabularyTags: eq.vocabularyTags,
          difficulty: eq.difficulty,
          explanation: eq.explanation,
          origin: q.origin,
          translations: passage?.translations ? { ...passage.translations } : undefined,
        };
      });
      if (sharedPassage?.text) {
        part.textTitle = sharedPassage.title || '';
        part.text = sharedPassage.text;
        part.passageId = sharedPassage.id;
        if (sharedPassage.translations) part.translations = { ...sharedPassage.translations };
      }
      const sharedOpts = enriched.find((q) => q.options?.length)?.options;
      if (!part.text && Array.isArray(sharedOpts) && sharedOpts.length) {
        part.text = sharedOpts.join('\n');
      }
      return part;
    }

    const [firstPid, firstQs] = [...groups.entries()][0] || ['', enriched];
    const groupEntries = [...groups.entries()].filter(([pid]) => !String(pid).startsWith('_solo_'));
    const passage =
      sharedPassage ||
      (firstPid && !firstPid.startsWith('_solo_') ? getPassage(bank, firstPid) : resolvePassage(bank, firstQs[0]));
    if (groupEntries.length > 1 && (partSpec.passagesPerPart >= 2 || layout === 'passage_questions')) {
      part.passages = groupEntries
        .map(([pid, qs]) => {
          const p = getPassage(bank, pid) || resolvePassage(bank, qs[0]);
          return p?.text ? { id: p.id, title: p.title || '', text: p.text } : null;
        })
        .filter(Boolean);
    }
    if (passage?.text) {
      part.textTitle = passage.title || '';
      part.text = passage.text;
      part.passageId = passage.id;
      if (passage.translations) part.translations = { ...passage.translations };
    }
    const allQs = enriched.length ? enriched : (firstQs.length ? firstQs : []);
    part.questions = allQs.map((q, i) => {
      const eq = toExamQuestion(q, i);
      const pid =
        typeof PassageResolver !== 'undefined'
          ? PassageResolver.passageIdFromQuestion(q)
          : q.passageId;
      if (pid) eq.passageId = pid;
      return eq;
    });
    return part;
  }

  function buildHorenPart(partSpec, questions, bank) {
    const { groups, enriched } = groupByPassage(questions, bank);
    const segments = [];
    const recWord = bank?.meta?.language === 'de' ? 'Aufnahme' : bank?.meta?.language === 'es' ? 'Grabación' : 'Recording';
    let si = 0;
    groups.forEach((qs, pid) => {
      const passage =
        pid && !pid.startsWith('_solo_') ? getPassage(bank, pid) : resolvePassage(bank, qs[0]);
      const transcript = passage?.text || qs[0]?.transcript || '';
      segments.push({
        id: `seg_${partSpec.teil}_${si}`,
        label: qs[0]?.segmentLabel || `${recWord} ${si + 1}`,
        transcript,
        passageId: passage?.id || (pid.startsWith('_solo_') ? undefined : pid),
        questions: qs.map((q, i) => {
          const eq = toExamQuestion(q, i);
          const qpid =
            typeof PassageResolver !== 'undefined'
              ? PassageResolver.passageIdFromQuestion(q)
              : q.passageId;
          if (qpid) eq.passageId = qpid;
          return eq;
        }),
        translations: passage?.translations ? { ...passage.translations } : undefined,
      });
      si++;
    });
    const partTranscript = segments.map((s) => s.transcript).filter(Boolean).join('\n\n');
    return {
      teil: partSpec.teil,
      instruction: partSpec.instruction || partSpec.label,
      blueprintSlot: partSpec.slotType,
      transcript: partTranscript || undefined,
      segments: segments.length
        ? segments
        : [{ id: `seg_${partSpec.teil}`, label: `${recWord} 1`, transcript: '', questions: [] }],
    };
  }

  function buildGrammatikPart(partSpec, questions) {
    return {
      teil: partSpec.teil,
      instruction: partSpec.instruction || partSpec.label,
      blueprintSlot: partSpec.slotType,
      questions: questions.map((q, i) => toExamQuestion(q, i)),
    };
  }

  function buildSchreibenPart(partSpec, questions) {
    const q = questions[0];
    const words = partSpec.wordsTarget || { min: 80, max: 100 };
    const taskText =
      q?.question ||
      (partSpec.label ? `${partSpec.label}: ${partSpec.instruction || 'Write your response.'}` : partSpec.instruction);
    if (!taskText) return null;
    return {
      aufgabe: partSpec.teil,
      fieldId: `write_bp_${partSpec.teil}`,
      task: taskText,
      minWords: words.min,
      maxWords: words.max,
      mandatory: !!partSpec.mandatory,
      taskType: partSpec.taskTypes?.[0] || partSpec.slotType,
      blueprintSlot: partSpec.slotType,
      grammarTags: q?.grammarTags || [],
      topicTags: q?.topicTags || [],
    };
  }

  function buildSprechenPart(partSpec, questions, lang) {
    const q = questions[0];
    const isDe = lang === 'de';
    return {
      teil: partSpec.teil,
      title: partSpec.label || `Teil ${partSpec.teil}`,
      fieldId: `speak_bp_${partSpec.teil}`,
      situation: q?.question || partSpec.instruction || (isDe ? 'Bereiten Sie sich auf die mündliche Aufgabe vor.' : 'Prepare for the speaking task.'),
      points: partSpec.taskTypes || [],
      blueprintSlot: partSpec.slotType,
      grammarTags: q?.grammarTags || [],
      topicTags: q?.topicTags || [],
    };
  }

  function buildUseOfEnglishPart(partSpec, questions, bank) {
    const layout = partSpec.layout || 'questions';
    if (layout === 'passage_questions' || layout === 'items') {
      return buildLesenPart(partSpec, questions, bank);
    }
    return buildGrammatikPart(partSpec, questions);
  }

  function routeModulePart(modId, partSpec, picked, bank, result) {
    const id = String(modId).toLowerCase();
    const lang = bank?.meta?.language || 'de';

    if (id === 'lesen' || id === 'reading') {
      if (!picked.length) return;
      result.lesenParts.push(buildLesenPart(partSpec, picked, bank));
    } else if (id === 'horen' || id === 'listening') {
      if (!picked.length) return;
      result.horenParts.push(buildHorenPart(partSpec, picked, bank));
    } else if (id === 'grammatik') {
      if (!picked.length) return;
      result.grammatikParts.push(buildGrammatikPart(partSpec, picked));
    } else if (id === 'use_of_english') {
      if (!picked.length) return;
      result.useOfEnglishParts.push(buildUseOfEnglishPart(partSpec, picked, bank));
    } else if (id === 'schreiben' || id === 'writing') {
      const sp = buildSchreibenPart(partSpec, picked);
      if (sp) result.schreibenParts.push(sp);
    } else if (id === 'sprechen' || id === 'speaking') {
      result.sprechenParts = result.sprechenParts || [];
      result.sprechenParts.push(buildSprechenPart(partSpec, picked, lang));
    }
  }

  /**
   * Assemble exam sections from blueprint + question bank.
   * Returns parts arrays and a coverage report (target vs filled).
   */
  function assemble(bank, blueprint, options = {}) {
    const used = new Set();
    const filterFn = options.filter || null;
    const difficultyRange = options.difficultyRange || null;
    const difficultyFilter = difficultyRange
      ? (q) => {
          if (q.difficulty == null) return true;
          return q.difficulty >= difficultyRange[0] && q.difficulty <= difficultyRange[1];
        }
      : null;
    const combinedFilter = filterFn && difficultyFilter
      ? (q) => filterFn(q) && difficultyFilter(q)
      : filterFn || difficultyFilter;

    const result = {
      lesenParts: [],
      horenParts: [],
      grammatikParts: [],
      useOfEnglishParts: [],
      schreibenParts: [],
      sprechenParts: [],
      selected: [],
      coverage: [],
    };

    for (const mod of blueprint.modules || []) {
      const pool = modulePool(bank, mod.id);
      for (const partSpec of mod.parts || []) {
        const target = partSpec.itemsTotal || partSpec.questionsTotal?.max || partSpec.questionsTotal?.min || 1;
        let picked = pickFromPool(pool, partSpec, used, bank, combinedFilter, {
          calibration: options.calibration,
          moduleId: mod.id,
          excludeIds: options.excludeIds,
          applyBurned: options.applyBurned,
        });
        if (!picked.length && difficultyFilter) {
          picked = pickFromPool(pool, partSpec, used, bank, filterFn, {
            calibration: options.calibration,
            moduleId: mod.id,
            excludeIds: options.excludeIds,
            applyBurned: options.applyBurned,
          });
        }
        const enrichedPicked =
          typeof PassageResolver !== 'undefined'
            ? PassageResolver.enrichQuestionPassageIds(picked)
            : picked;
        result.selected.push(...enrichedPicked);
        result.coverage.push({
          module: mod.id,
          teil: partSpec.teil,
          slotType: partSpec.slotType,
          taskFormat: partSpec.taskFormat,
          target,
          filled: enrichedPicked.length,
          complete: enrichedPicked.length >= (partSpec.questionsTotal?.min || target),
          wordsPerPassage: partSpec.wordsPerPassage || partSpec.wordsTarget || null,
        });

        routeModulePart(mod.id, partSpec, enrichedPicked, bank, result);
      }
    }

    return result;
  }

  function partTarget(partSpec) {
    return partSpec.itemsTotal || partSpec.questionsTotal?.max || partSpec.questionsTotal?.min || 1;
  }

  /** Build exam parts from pre-grouped picks (Phase 5 personalized assembly). */
  function finalizeAssembly(bank, blueprint, partEntries) {
    const result = {
      lesenParts: [],
      horenParts: [],
      grammatikParts: [],
      useOfEnglishParts: [],
      schreibenParts: [],
      sprechenParts: [],
      selected: [],
      coverage: [],
    };
    for (const entry of partEntries) {
      const { modId, partSpec, picked } = entry;
      const target = partTarget(partSpec);
      const enrichedPicked =
        typeof PassageResolver !== 'undefined' ? PassageResolver.enrichQuestionPassageIds(picked) : picked;
      result.selected.push(...enrichedPicked);
      result.coverage.push({
        module: modId,
        teil: partSpec.teil,
        slotType: partSpec.slotType,
        taskFormat: partSpec.taskFormat,
        target,
        filled: enrichedPicked.length,
        complete: enrichedPicked.length >= (partSpec.questionsTotal?.min || target),
        wordsPerPassage: partSpec.wordsPerPassage || partSpec.wordsTarget || null,
      });
      routeModulePart(modId, partSpec, enrichedPicked, bank, result);
    }
    return result;
  }

  function enumeratePartSlots(blueprint) {
    const slots = [];
    for (const mod of blueprint.modules || []) {
      for (const partSpec of mod.parts || []) {
        const target = partTarget(partSpec);
        for (let i = 0; i < target; i++) {
          slots.push({ modId: mod.id, partSpec, slotIndex: i });
        }
      }
    }
    return slots;
  }

  function coverageSummary(coverage) {
    const total = coverage.length;
    const complete = coverage.filter((c) => c.complete).length;
    return { total, complete, ratio: total ? complete / total : 0 };
  }

  return {
    INDEX,
    hasBlueprint,
    load,
    loadSync,
    cacheBlueprint,
    blueprintPath,
    assemble,
    finalizeAssembly,
    enumeratePartSlots,
    partTarget,
    coverageSummary,
    modulePool,
    pickFromPool,
    typeAllowed,
    ...(adsMatching() || {}),
  };
})();

if (typeof window !== 'undefined') window.ExamBlueprint = ExamBlueprint;
if (typeof module !== 'undefined') module.exports = ExamBlueprint;
