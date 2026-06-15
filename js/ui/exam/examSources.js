/**
 * Exam generation source cascade — pool → question library → exam library → AI.
 */
(function (global) {
  var CASCADE_ORDER = ['pool', 'questionLibrary', 'examLibrary'];

  function defaultDeps() {
    return {
      fetchExamFromPool: typeof fetchExamFromPool === 'function' ? fetchExamFromPool : null,
      QuestionLibrary: typeof QuestionLibrary !== 'undefined' ? QuestionLibrary : null,
      ExamLibrary: typeof ExamLibrary !== 'undefined' ? ExamLibrary : null,
      normalizeExam: typeof normalizeExam === 'function' ? normalizeExam : null,
      validateExamCandidate:
        typeof validateExamCandidate === 'function' ? validateExamCandidate : null,
      isExamRenderable: typeof isExamRenderable === 'function' ? isExamRenderable : null,
      lcStrategyBEnabled:
        typeof lcStrategyBEnabled === 'function'
          ? function (opts) {
              return lcStrategyBEnabled(opts);
            }
          : function () {
              return false;
            },
      setLoaderStep: typeof setLoaderStep === 'function' ? setLoaderStep : function () {},
      lcDebug: typeof lcDebug !== 'undefined' ? lcDebug : { warn: function () {} },
    };
  }

  function validateCandidate(raw, deps, opts) {
    if (deps.validateExamCandidate) return deps.validateExamCandidate(raw, opts);
    var normalized = deps.normalizeExam ? deps.normalizeExam(raw) : raw;
    if (!normalized) return { ok: false, normalized: null };
    if (deps.isExamRenderable && !deps.isExamRenderable(normalized)) {
      return { ok: false, normalized: normalized };
    }
    return { ok: true, normalized: normalized };
  }

  async function fromPool(ctx, deps) {
    deps = deps || defaultDeps();
    if (!deps.fetchExamFromPool) return null;
    deps.setLoaderStep('Loading curated exam\u2026', 'Finding a matching exam\u2026');
    try {
      var pooled = await deps.fetchExamFromPool(ctx.subject, ctx.level, ctx.seenIds || []);
      if (!pooled || !pooled.found || !pooled.exam) return null;
      if (typeof BurnedRegistry !== 'undefined' && BurnedRegistry.examTouchesBurned(pooled.exam)) return null;
      var check = validateCandidate(pooled.exam, deps);
      if (!check.ok) return null;
      return {
        source: 'pool',
        examData: check.normalized,
        topic: pooled.topic || check.normalized.topic || 'Curated exam',
        poolId: pooled.id || null,
        provenance: pooled.exam.provenance || null,
        poolSource: true,
      };
    } catch (err) {
      deps.lcDebug.warn('[exam] pool fetch failed:', err);
      return null;
    }
  }

  async function fromQuestionLibrary(ctx, deps) {
    deps = deps || defaultDeps();
    if (!deps.QuestionLibrary || !deps.QuestionLibrary.hasLibrary(ctx.subject, ctx.level)) {
      return null;
    }
    deps.setLoaderStep('Assembling exam\u2026', 'Building your exam from the question bank\u2026');
    try {
      var raw = await deps.QuestionLibrary.buildExam(ctx.subject, ctx.level);
      var check = validateCandidate(raw, deps);
      if (!check.ok) return null;
      return {
        source: 'question-library',
        examData: check.normalized,
        topic: check.normalized.topic || null,
      };
    } catch (err) {
      deps.lcDebug.warn('[exam] question library build failed:', err);
      return null;
    }
  }

  async function fromExamLibrary(ctx, deps) {
    deps = deps || defaultDeps();
    if (!deps.ExamLibrary || !deps.ExamLibrary.hasLibrary(ctx.subject, ctx.level)) {
      return null;
    }
    deps.setLoaderStep('Loading exam\u2026', 'Selecting a prepared exam\u2026');
    var raw;
    if (
      typeof BurnedRegistry !== 'undefined' &&
      typeof deps.ExamLibrary.pickExamExcluding === 'function'
    ) {
      raw = await deps.ExamLibrary.pickExamExcluding(ctx.subject, ctx.level, function (e) {
        return BurnedRegistry.examTouchesBurned(e);
      });
      if (!raw) return null;
    } else {
      raw = await deps.ExamLibrary.pickExam(ctx.subject, ctx.level);
    }
    var normalized = deps.normalizeExam ? deps.normalizeExam(raw) : raw;
    if (!normalized || (deps.isExamRenderable && !deps.isExamRenderable(normalized))) {
      throw new Error('The exam library entry is incomplete.');
    }
    return {
      source: 'library',
      examData: normalized,
      topic: normalized.topic || null,
    };
  }

  /**
   * Run non-AI sources in fixed order. Returns { status: 'hit', ... } or { status: 'continue' }
   * or { status: 'blocked', message } for Strategy B with genuinely no library.
   *
   * When a library exists but buildExam fails (e.g. BurnedRegistry exhausted), we return
   * { status: 'continue', reason: 'library_exhausted' } so AI can serve as fallback rather
   * than dead-ending the user.
   */
  async function runExamSourceCascade(ctx, deps) {
    deps = deps || defaultDeps();
    var poolHit = await fromPool(ctx, deps);
    if (poolHit) return { status: 'hit', result: poolHit };

    var hadLibrary =
      deps.QuestionLibrary &&
      typeof deps.QuestionLibrary.hasLibrary === 'function' &&
      deps.QuestionLibrary.hasLibrary(ctx.subject, ctx.level);

    var qlHit = await fromQuestionLibrary(ctx, deps);
    if (qlHit) return { status: 'hit', result: qlHit };

    var libHit = await fromExamLibrary(ctx, deps);
    if (libHit) return { status: 'hit', result: libHit };

    if (deps.lcStrategyBEnabled({ subject: ctx.subject, level: ctx.level })) {
      if (hadLibrary) {
        return {
          status: 'blocked',
          message:
            'We couldn\u2019t assemble a complete exam right now. Please try again later.',
        };
      }
      return {
        status: 'blocked',
        message:
          'No curated exam is available for this level yet. Personalized vocabulary exams from your flashcards still work.',
      };
    }

    var liveAiOff =
      typeof liveAiDisabled === 'function'
        ? liveAiDisabled(ctx.subject, ctx.level)
        : false;
    if (liveAiOff) {
      return {
        status: 'blocked',
        message:
          'Content is being prepared for this level. Try another language/level or use personalized exams from your flashcards.',
      };
    }

    return { status: 'continue' };
  }

  global.CASCADE_ORDER = CASCADE_ORDER;
  global.fromPool = fromPool;
  global.fromQuestionLibrary = fromQuestionLibrary;
  global.fromExamLibrary = fromExamLibrary;
  global.runExamSourceCascade = runExamSourceCascade;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CASCADE_ORDER: CASCADE_ORDER,
      fromPool: fromPool,
      fromQuestionLibrary: fromQuestionLibrary,
      fromExamLibrary: fromExamLibrary,
      runExamSourceCascade: runExamSourceCascade,
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
