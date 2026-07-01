/* Bundled Schreiben+Sprechen production eval — AI credits per module type. */
(function () {
  const CORE = typeof ProductionEvalCore !== 'undefined' ? ProductionEvalCore : null;

  function buildSchreibenTasks(parts, getAns) {
    return (parts || []).map((p, i) => ({
      id: String(p.aufgabe ?? p.teil ?? p.fieldId ?? `w${i}`),
      aufgabe: p.aufgabe ?? p.teil,
      teil: p.teil,
      task: String(p.instruction || p.task || p.prompt || p.taskText || '').trim(),
      userText: getAns(p),
      minWords: Number(p.minWords) || 0,
      fieldId: p.fieldId,
    }));
  }

  function buildSprechenTasks(parts) {
    return (parts || []).map((p, i) => ({
      id: String(p.teil ?? p.fieldId ?? `s${i}`),
      teil: p.teil,
      fieldId: p.fieldId,
      situation: String(p.situation || '').trim(),
      points: Array.isArray(p.points) ? p.points : [],
      transcript: String(document.getElementById(p.fieldId)?.value.trim() || ''),
      modelAnswer: String(p.modelAnswer || '').trim(),
    }));
  }

  function orientativeSpeakingEval(part, txt, isDE) {
    const hintFn = typeof buildOrientativeSpeakingHint === 'function' ? buildOrientativeSpeakingHint : null;
    const hint = hintFn
      ? hintFn(part, txt, isDE)
      : { note: isDE ? 'Nicht evaluiert (orientativ)' : 'Not evaluated (orientative)' };
    return {
      part,
      ai: false,
      evaluated: false,
      orientative: true,
      score: null,
      note: hint.note,
      hint: hint.note,
      transcript: txt,
    };
  }

  window.evalProductionModulesWithAI = async function ({
    lang,
    level,
    passPercent = 60,
    schreibenParts = [],
    sprechenParts = [],
    isDE = false,
    getSchreibenAnsFn,
  } = {}) {
    const getAns = getSchreibenAnsFn || (typeof getSchreibenAns === 'function' ? getSchreibenAns : () => '');
    const schreiben = buildSchreibenTasks(schreibenParts, getAns).filter((t) => t.userText);
    const sprechen = buildSprechenTasks(sprechenParts).filter((t) => t.transcript);
    const payload = { lang, level, passPercent, schreiben, sprechen };
    const cacheKey = CORE ? CORE.hashProductionSubmission(payload) : null;
    if (cacheKey && CORE) {
      const cached = CORE.readProductionEvalCache(cacheKey);
      if (cached?.ok) {
        return {
          ...cached,
          fromCache: true,
          schreibenEvals: cached.schreiben || [],
          sprechenEvals: (cached.sprechen || []).map((s) => ({
            ...s,
            part: sprechenParts.find((p) => String(p.teil ?? p.fieldId) === s.id) || { teil: s.id },
            ai: true,
            score: s.score,
          })),
        };
      }
    }

    if (!schreiben.length && !sprechen.length) {
      return { ok: false, error: 'empty_submission', quotaBlocked: false };
    }

    if (schreiben.length && typeof requireAiCredits === 'function' && !requireAiCredits('writing_correction')) {
      return { ok: false, error: 'ai_credits_exhausted', quotaBlocked: true, schreibenEvals: [], sprechenEvals: [] };
    }
    if (sprechen.length && typeof requireAiCredits === 'function' && !requireAiCredits('speaking')) {
      return { ok: false, error: 'ai_credits_exhausted', quotaBlocked: true, schreibenEvals: [], sprechenEvals: [] };
    }

    const requestId = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fn = typeof lcApiFetch === 'function' ? lcApiFetch : fetch;
    let res;
    try {
      res = await fn('/.netlify/functions/claude-chat', {
        method: 'POST',
        credentials: 'include',
        headers: typeof aiAuthHeaders === 'function' ? aiAuthHeaders() : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scoreProductionModules: true,
          requestId,
          lang,
          level,
          passPercent,
          schreiben,
          sprechen,
        }),
      });
    } catch (err) {
      return {
        ok: false,
        error: 'network_error',
        quotaBlocked: false,
        schreibenEvals: [],
        sprechenEvals: sprechen.map((t) =>
          orientativeSpeakingEval(
            sprechenParts.find((p) => String(p.teil ?? p.fieldId) === t.id) || {},
            t.transcript,
            isDE,
          ),
        ),
      };
    }

    const data = await res.json().catch(() => ({}));
    if (typeof applyAiCreditsFromResponse === 'function') applyAiCreditsFromResponse(data);
    if (!res.ok || !data.ok) {
      const creditsBlocked =
        res.status === 402 ||
        data.error === 'ai_credits_exhausted' ||
        data.error === 'pro_only' ||
        data.error === 'login_required';
      if (creditsBlocked && typeof showAiCreditsExhausted === 'function') showAiCreditsExhausted(data);
      return {
        ok: false,
        error: data.error || 'eval_failed',
        quotaBlocked: creditsBlocked,
        schreibenEvals: [],
        sprechenEvals: sprechen.map((t) =>
          orientativeSpeakingEval(
            sprechenParts.find((p) => String(p.teil ?? p.fieldId) === t.id) || {},
            t.transcript,
            isDE,
          ),
        ),
      };
    }

    const result = {
      ok: true,
      passPercent: data.passPercent ?? passPercent,
      feedbackLevel: data.feedbackLevel || 'full',
      schreiben: data.schreiben || [],
      sprechen: data.sprechen || [],
      schreibenEvals: data.schreiben || [],
      sprechenEvals: (data.sprechen || []).map((s) => ({
        ...s,
        part: sprechenParts.find((p) => String(p.teil ?? p.fieldId) === s.id) || { teil: s.id },
        ai: true,
        score: s.score,
        passed: s.passed,
        criteria: s.criteria,
        overallFeedback: s.overallFeedback,
        strongPoints: s.strongPoints,
        improvements: s.improvements,
        correctedVersion: s.correctedVersion,
        errorCounts: s.errorCounts,
        transcript: s.transcript,
      })),
    };
    if (cacheKey && CORE) CORE.writeProductionEvalCache(cacheKey, result);
    return result;
  };
})();
