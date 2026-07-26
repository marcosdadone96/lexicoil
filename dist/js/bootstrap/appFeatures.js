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
    const chargeQuota =
      (typeof window.commitExamQuota === 'function' || typeof commitExamQuota === 'function') &&
      (typeof shouldChargeStandardExamQuota === 'function'
        ? shouldChargeStandardExamQuota(hit)
        : false);
    if (chargeQuota) {
      const commit = window.commitExamQuota || commitExamQuota;
      await commit();
      if (typeof refreshQuotaFromServer === 'function') {
        try {
          await refreshQuotaFromServer();
        } catch (_) {
          /* non-fatal */
        }
      }
    }
    S.examData = hit.examData;
    if (hit.topic) S.examData.topic = hit.topic;
    if (hit.poolSource) {
      S.examData.poolSource = true;
      S.examData.poolId = hit.poolId || null;
      if (hit.provenance) S.examData.provenance = hit.provenance;
    }
    S.examSource = hit.source;
    if (typeof assignSavedExamIdentity === 'function') assignSavedExamIdentity(S.examData);
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
    let raw;
    try {
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
    let normalized = typeof normalizeExam === 'function' ? normalizeExam(raw) : raw;
    if (!normalized || (typeof isExamRenderable === 'function' && !isExamRenderable(normalized))) {
      if (typeof releaseExamGeneration === 'function' && (S._activeGenTicket || normalized?._genTicket)) {
        await releaseExamGeneration(S._activeGenTicket || normalized._genTicket, { unusable: true });
        S._activeGenTicket = null;
      }
      throw new Error('AI returned an incomplete exam. Please try again.');
    }
    if (typeof lcExamPassesValidator === 'function' && !lcExamPassesValidator(normalized)) {
      if (typeof releaseExamGeneration === 'function' && (S._activeGenTicket || normalized._genTicket)) {
        await releaseExamGeneration(S._activeGenTicket || normalized._genTicket, { unusable: true });
        S._activeGenTicket = null;
      }
      const e = new Error('AI returned an exam with invalid answer keys. Please try again.');
      e.code = 'exam_invalid';
      throw e;
    }
    if (typeof lcValidateExamOnServer === 'function') {
      const srv = await lcValidateExamOnServer(normalized, {
        verifyAnswerKeys: true,
        discardFailedItems: true,
      });
      if (srv.exam) {
        for (const k of ['lesenParts', 'horenParts', 'schreibenParts', 'sprechenParts', 'readingParts', 'listeningParts']) {
          if (Array.isArray(srv.exam[k])) normalized[k] = srv.exam[k];
        }
        if (typeof normalizeExam === 'function') {
          normalized = normalizeExam(normalized, { skipPostprocess: true }) || normalized;
        }
        if (typeof repairPersonalExamAnswerability === 'function') {
          normalized = repairPersonalExamAnswerability(normalized);
        }
        if (typeof pruneEmptyGoetheParts === 'function') {
          normalized = pruneEmptyGoetheParts(normalized);
        }
      }
      if (!srv.valid && !srv.skipped) {
        if (typeof releaseExamGeneration === 'function' && (S._activeGenTicket || normalized._genTicket)) {
          await releaseExamGeneration(S._activeGenTicket || normalized._genTicket, { unusable: true });
          S._activeGenTicket = null;
        }
        const e = new Error('Generated exam failed answer-key validation.');
        e.code = 'exam_invalid';
        throw e;
      }
      if (!isExamRenderable(normalized)) {
        if (typeof releaseExamGeneration === 'function' && (S._activeGenTicket || normalized._genTicket)) {
          await releaseExamGeneration(S._activeGenTicket || normalized._genTicket, { unusable: true });
          S._activeGenTicket = null;
        }
        const e = new Error('No valid exam content remained after verification.');
        e.code = 'exam_invalid';
        e.quotaRefund = true;
        throw e;
      }
    }
    setLoaderStep('Processing\u2026', 'Almost ready\u2026');
    S.examData = normalized;
    S.examData.topic = topic;
    S.examSource = 'ai';
    if (typeof examHasUnanswerableQuestions === 'function' && examHasUnanswerableQuestions(S.examData)) {
      if (typeof releaseExamGeneration === 'function' && (S._activeGenTicket || S.examData._genTicket)) {
        await releaseExamGeneration(S._activeGenTicket || S.examData._genTicket, { unusable: true });
        S._activeGenTicket = null;
      }
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
    const genTicket = S.examData._genTicket || S._activeGenTicket;
    if (genTicket && typeof deliverExamGeneration === 'function') {
      try {
        await deliverExamGeneration(genTicket);
      } catch (_) { /* non-fatal */ }
      delete S.examData._genTicket;
      S._activeGenTicket = null;
    }
    renderExam();
    } catch (e) {
      if (typeof releaseExamGeneration === 'function' && S._activeGenTicket) {
        try {
          await releaseExamGeneration(S._activeGenTicket, { unusable: true });
        } catch (_) { /* ignore */ }
        S._activeGenTicket = null;
      }
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
      const canStart =
        typeof canStartStandardExam === 'function'
          ? canStartStandardExam(S.subject, S.level)
          : canGenerate();
      if (!canStart) {
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
        if (cascade.result && cascade.result.recycled) {
          notify('You have seen all available exams; here is one to review again.', 'info', 5000);
        }
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
