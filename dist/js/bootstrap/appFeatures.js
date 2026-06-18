/* LexiCoil app features shim — wires modules, exam generation orchestrator */
(function () {
  if (typeof S === 'undefined') return;

  S.examSource = S.examSource || null;

  window.pickExamTopic = async function (subject, level) {
    if (typeof LexiCoilEngine !== 'undefined' && typeof LexiCoilEngine.pickTopic === 'function') {
      const topic = await LexiCoilEngine.pickTopic(subject, level);
      if (topic) return topic;
    }
    if (typeof KnowledgeEngine !== 'undefined' && typeof KnowledgeEngine.pickRandomTopic === 'function') {
      return KnowledgeEngine.pickRandomTopic(subject, level);
    }
    throw new Error('Topic resolver not available');
  };

  window.setLoaderStep = function (title, sub) {
    const t = document.getElementById('loaderTitle');
    const s = document.getElementById('loaderSub');
    if (t) t.textContent = title;
    if (s) s.textContent = sub;
  };

  function lcStrategyBEnabled(opts) {
    if (typeof strategyBEnabled === 'function') {
      return strategyBEnabled({
        subject: S.subject,
        level: S.level,
        ...(opts || {}),
      });
    }
    return typeof window !== 'undefined' && window.LC_STRATEGY_B === '1';
  }
  window.lcStrategyBEnabled = lcStrategyBEnabled;

  function isCurrentLevelServable() {
    if (typeof LibraryLoader !== 'undefined' && LibraryLoader.hasLibrary) {
      return LibraryLoader.hasLibrary(S.subject, S.level);
    }
    if (typeof isLevelServable === 'function') {
      return isLevelServable(S.subject, S.level);
    }
    return false;
  }

  function resetExamSessionState() {
    S.isDemo = false;
    S.examSource = null;
    S.answers = {};
    S.gapAnswers = {};
    S.quickMod = null;
  }

  async function applyCascadeHit(hit) {
    if (typeof commitExamQuota === 'function') await commitExamQuota();
    S.examData = hit.examData;
    if (hit.topic) S.examData.topic = hit.topic;
    if (hit.poolSource) {
      S.examData.poolSource = true;
      S.examData.poolId = hit.poolId || null;
      if (hit.provenance) S.examData.provenance = hit.provenance;
    }
    S.examSource = hit.source;
  }

  async function runAiExamPath() {
    const topic = await pickExamTopic(S.subject, S.level);
    if (!canGenerate()) {
      backToWorkspace('exams');
      const avail = typeof ExamLibrary !== 'undefined' ? ExamLibrary.availableLevels(S.subject) : [];
      const langLbl =
        typeof SubjectMeta !== 'undefined'
          ? SubjectMeta.langName(S.subject)
          : S.subject === 'de'
            ? 'German'
            : S.subject === 'es'
              ? 'Spanish'
              : 'English';
      const hint = avail.length ? ` Available library levels (${langLbl}): ${avail.join(', ')}` : '';
      notify(`No exam library for ${S.level} yet.${hint}`, 'warn', 5000);
      return;
    }
    setLoaderStep('Generating with AI\u2026', 'Starting exam generation\u2026');
    try {
    let raw;
    try {
      raw = await generateExamChunks(topic, (s) => setLoaderStep('Generating with AI\u2026', s));
    } catch (e) {
      if (e.code === 'exam_low_quality' || e.code === 'exam_invalid') {
        setLoaderStep('Improving quality\u2026', 'Regenerating with stricter prompts\u2026');
        raw = await generateExamChunks(topic, (s) => setLoaderStep('Improving quality\u2026', s));
      } else {
        throw e;
      }
    }
    const normalized = typeof normalizeExam === 'function' ? normalizeExam(raw) : raw;
    if (!normalized || (typeof isExamRenderable === 'function' && !isExamRenderable(normalized))) {
      throw new Error('AI returned an incomplete exam. Please try again.');
    }
    if (typeof lcExamPassesValidator === 'function' && !lcExamPassesValidator(normalized)) {
      const e = new Error('AI returned an exam with invalid answer keys. Please try again.');
      e.code = 'exam_invalid';
      throw e;
    }
    if (typeof lcValidateExamOnServer === 'function') {
      const srv = await lcValidateExamOnServer(normalized);
      if (!srv.valid) {
        const e = new Error('Generated exam failed answer-key validation.');
        e.code = 'exam_invalid';
        throw e;
      }
    }
    setLoaderStep('Processing\u2026', 'Almost ready\u2026');
    S.examData = normalized;
    S.examData.topic = topic;
    S.examSource = 'ai';
    if (typeof examHasUnanswerableQuestions === 'function' && examHasUnanswerableQuestions(S.examData)) {
      const e = new Error('AI returned questions without answer options.');
      e.code = 'exam_invalid';
      throw e;
    }
    if (typeof contributeExamToPool === 'function') {
      contributeExamToPool(S.subject, S.level, topic, S.examData).catch(function () {});
    }
    if (typeof logAiGeneration === 'function') {
      logAiGeneration({
        lang: S.subject,
        level: S.level,
        source: 'ai',
        topic,
        vocabWords: [],
        coverage: null,
        valid: true,
        examData: S.examData,
      });
    }
    renderExam();
    } catch (e) {
      if (typeof logAiGeneration === 'function') {
        logAiGeneration({
          lang: S.subject,
          level: S.level,
          source: 'ai',
          topic,
          vocabWords: [],
          coverage: null,
          valid: false,
          examData: null,
        });
      }
      throw e;
    }
  }

  function handleGenerateExamError(e) {
    if (typeof showExamError === 'function') {
      showExamError(e);
      return;
    }
    backToWorkspace('exams');
    if (e.code === 'quota_exceeded') {
      showQuotaExceededModal(e);
      return;
    }
    if (e.code === 'timeout' || e.code === 'gateway_timeout') {
      notify('Exam generation timed out. Please try again.', 'warn', 5000);
      return;
    }
    const msg = String(e.message || 'Unknown error');
    if (/json|parse|unterminated/i.test(msg)) {
      notify('AI returned incomplete data. Please try again.', 'error', 5000);
      return;
    }
    if (e.code === 'exam_low_quality') {
      notify('AI returned low-quality content. Please try again.', 'warn', 5000);
      return;
    }
    if (e.code === 'exam_invalid') {
      notify('AI returned invalid answer keys. Please try again.', 'warn', 5000);
      return;
    }
    notify(msg, 'error', 5000);
  }

  window.generateExam = async function () {
    resetExamSessionState();
    hideAll();
    show('loadingScreen');

    try {
      if (!canGenerate()) {
        hideAll();
        backToWorkspace('exams');
        showQuotaExceededModal({ used: getQuotaUsed(), max: getQuotaMax(), plan: S.plan });
        return;
      }

      if (typeof LibraryLoader !== 'undefined' && LibraryLoader.probeLevel) {
        await LibraryLoader.probeLevel(S.subject, S.level);
      }

      const cascade = await runExamSourceCascade({
        subject: S.subject,
        level: S.level,
        seenIds: typeof seenPoolIds === 'function' ? seenPoolIds(S.subject, S.level) : [],
      });

      if (cascade.status === 'hit') {
        await applyCascadeHit(cascade.result);
        renderExam();
        return;
      }
      if (cascade.status === 'blocked') {
        backToWorkspace('exams');
        notify(cascade.message, cascade.message.includes('try again') ? 'error' : 'warn', 6000);
        return;
      }

      if (isCurrentLevelServable()) {
        backToWorkspace('exams');
        notify(
          'We couldn\u2019t assemble a complete exam right now. Please try again later.',
          'error',
          6000,
        );
        return;
      }

      await runAiExamPath();
    } catch (e) {
      handleGenerateExamError(e);
    }
  };

  const origInit = window.init;
  window.init = async function () {
    await origInit();
    await handleUrlParams();
  };
  if (window.initPromise) {
    window.initPromise = window.initPromise.then(function () {
      return handleUrlParams();
    });
  }
})();
