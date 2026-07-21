const CLAUDE_ENDPOINT = "/.netlify/functions/claude-chat";
const EXAM_PLAN_ENDPOINT = "/.netlify/functions/exam-plan";
const HYBRID_EXECUTE_ENDPOINT = "/.netlify/functions/exam-hybrid-execute";

function aiAuthHeaders() {
  if (typeof lcAuthHeaders === 'function') return lcAuthHeaders();
  return { 'Content-Type': 'application/json' };
}

function lcFetch(url, options = {}) {
  const fn = typeof lcApiFetch === "function" ? lcApiFetch : fetch;
  if (fn === lcApiFetch) {
    return lcApiFetch(url, options);
  }
  return fetch(url, {
    credentials: "include",
    ...options,
    headers: { ...aiAuthHeaders(), ...(options.headers || {}) },
  });
}

function handleAiAuthError(res, data) {
  if (res.status === 401 && data.error === "token_revoked") {
    if (typeof Auth !== "undefined" && typeof Auth.handleTokenRevoked === "function") {
      Auth.handleTokenRevoked();
    }
    const e = new Error("token_revoked");
    e.code = "token_revoked";
    throw e;
  }
}

/**
 * Request a server-signed generation ticket that authorises up to maxChunks
 * Anthropic calls for one exam session.  Call ONCE per exam, then pass the
 * returned ticket to every callAI() call via options.genTicket.
 *
 * @param {string} scope     - 'exam_generation' | 'personal_exam' | 'quick_exam'
 * @param {number} maxChunks - number of AI calls the ticket should cover
 * @returns {Promise<string>} signed ticket string
 */
async function startExamGeneration(scope = 'exam_generation', maxChunks = 4) {
  const res = await lcFetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: aiAuthHeaders(),
    body: JSON.stringify({ startGeneration: true, scope, maxChunks }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleAiAuthError(res, data);
    if (res.status === 429 && data.error === 'quota_exceeded') {
      const e = new Error('quota_exceeded');
      e.code = 'quota_exceeded';
      e.used = data.used; e.max = data.max; e.plan = data.plan;
      throw e;
    }
    if (res.status === 402 && data.error === 'ai_credits_exhausted') {
      const e = new Error('ai_credits_exhausted');
      e.code = 'ai_credits_exhausted';
      e.remaining = data.remaining;
      e.aiUsed = data.aiUsed;
      e.aiMax = data.aiMax;
      throw e;
    }
    throw new Error(data.error || 'ticket_failed');
  }
  if (typeof window !== 'undefined' && typeof window.applyServerQuota === 'function') {
    window.applyServerQuota({
      ...data,
      aiUsed: data.aiUsed,
      aiRemaining: data.aiRemaining ?? data.remaining,
    });
  }
  return data.ticket;
}

/**
 * Release a generation ticket's upfront quota charge when generation produced nothing usable.
 * @param {string} genTicket
 * @param {{ unusable?: boolean }} [opts]
 * @returns {Promise<{ released: boolean, used?: number, max?: number, plan?: string }>}
 */
async function releaseExamGeneration(genTicket, opts = {}) {
  const res = await lcFetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: aiAuthHeaders(),
    body: JSON.stringify({
      releaseGeneration: true,
      genTicket,
      unusable: opts.unusable === true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleAiAuthError(res, data);
    return { released: false, error: data.error || 'release_failed' };
  }
  if (typeof window !== 'undefined' && typeof window.applyServerQuota === 'function' && data.released) {
    window.applyServerQuota({
      ...data,
      aiUsed: data.aiUsed,
      aiRemaining: data.aiRemaining ?? data.remaining,
    });
  }
  return data;
}

async function deliverExamGeneration(genTicket) {
  const res = await lcFetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: aiAuthHeaders(),
    body: JSON.stringify({ deliverGeneration: true, genTicket }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleAiAuthError(res, data);
    return { delivered: false, error: data.error || 'deliver_failed' };
  }
  if (typeof window !== 'undefined' && typeof window.applyServerQuota === 'function' && data.delivered) {
    window.applyServerQuota({
      ...data,
      aiUsed: data.aiUsed,
      aiRemaining: data.aiRemaining ?? data.remaining,
    });
  }
  return data;
}

async function renewExamGeneration(genTicket) {
  const res = await lcFetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: aiAuthHeaders(),
    body: JSON.stringify({ renewGeneration: true, genTicket }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleAiAuthError(res, data);
    throw new Error(data.error || 'renew_failed');
  }
  return data.ticket;
}

/**
 * Hybrid exam plan — pool vs live decision (no generation).
 * @returns {Promise<{ plan: object, meta: object }>}
 */
async function fetchHybridExamPlan(params) {
  const res = await lcFetch(EXAM_PLAN_ENDPOINT, {
    method: 'POST',
    headers: aiAuthHeaders(),
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleAiAuthError(res, data);
    throw new Error(data.error || 'exam_plan_failed');
  }
  return { plan: data.plan, meta: data.meta };
}

/**
 * Execute hybrid Lesen exam (pool + Gemini factory). Requires genTicket from startExamGeneration.
 * Client should call deliverExamGeneration(genTicket) when the exam is shown, or
 * releaseExamGeneration(genTicket) on total failure.
 */
async function executeHybridLesenExam({
  genTicket,
  topic,
  vocab,
  lang = 'de',
  level = 'B1',
  module = 'lesen',
  plan = null,
  planMeta = null,
  teils = null,
  poolThreshold = null,
  skipLive = false,
  onlyLiveTeil = null,
  includePool = true,
  partialExam = null,
  partialTrace = null,
  validateExam = true,
  timeoutMs = 55000,
} = {}) {
  if (!genTicket) throw new Error('genTicket_required');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await lcFetch(HYBRID_EXECUTE_ENDPOINT, {
      method: 'POST',
      headers: aiAuthHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        genTicket,
        topic,
        vocab,
        lang,
        level,
        module,
        plan,
        planMeta,
        teils,
        poolThreshold,
        skipLive,
        onlyLiveTeil,
        includePool,
        partialExam,
        partialTrace,
        validateExam,
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      const e = new Error('Hybrid exam generation timed out');
      e.code = 'timeout';
      throw e;
    }
    throw err;
  }
  clearTimeout(timer);
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw ? raw.slice(0, 200) : `hybrid_execute_${res.status}` };
  }
  if (!res.ok) {
    console.error('[hybrid-execute] HTTP', res.status, data);
    if (data.errorLog) {
      console.error('[hybrid-execute] server error log:', data.errorLog, data.phase || '', data.errorAt || '');
    }
    handleAiAuthError(res, data);
    if (res.status === 402 && data.error === 'ai_credits_exhausted') {
      const e = new Error('ai_credits_exhausted');
      e.code = 'ai_credits_exhausted';
      throw e;
    }
    if (res.status === 503 && data.error === 'live_gen_disabled') {
      const e = new Error('live_gen_disabled');
      e.code = 'live_gen_disabled';
      throw e;
    }
    if (res.status === 504 || data.error === 'hybrid_execute_timeout') {
      const e = new Error(
        data.details?.hint ||
          'Hybrid generation timed out (~55s per Teil). Retry or use fewer words.',
      );
      e.code = 'gateway_timeout';
      e.phase = data.phase;
      throw e;
    }
    const e = new Error(data.error || data.message || `hybrid_execute_${res.status}`);
    e.code = data.error;
    e.details = data.details;
    e.phase = data.phase;
    e.status = res.status;
    throw e;
  }
  return data;
}

async function callAI(prompt, maxTokens = 6000, options = {}) {
  const defaultTimeout = options.examGeneration ? 55000 : 35000;
  const { timeoutMs = defaultTimeout, examGeneration = false, aiAction = null, genTicket = null, examModel = null, requestId = null, chunkTeil = null, chunkSlotType = null } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await lcFetch(CLAUDE_ENDPOINT, {
      method: "POST",
      headers: aiAuthHeaders(),
      body: JSON.stringify({
        prompt,
        maxTokens,
        examGeneration,
        aiAction,
        genTicket,
        examModel: examModel || undefined,
        requestId: requestId || undefined,
        chunkTeil: chunkTeil ?? undefined,
        chunkSlotType: chunkSlotType || undefined,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      const e = new Error("AI request timed out");
      e.code = "timeout";
      throw e;
    }
    throw err;
  }
  clearTimeout(timer);

  const raw = await res.text();
  const looksLikeHtml = /<!DOCTYPE|<html/i.test(raw || "");
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    if (res.status === 504 || looksLikeHtml) {
      const e = new Error("Exam generation timed out on the server. Please try again.");
      e.code = "gateway_timeout";
      throw e;
    }
    const snippet = raw ? raw.slice(0, 120).replace(/\s+/g, " ") : "";
    throw new Error(
      res.ok
        ? "Invalid AI response"
        : `AI service error (${res.status})${snippet ? ": " + snippet : ""}`,
    );
  }

  if (!res.ok) {
    handleAiAuthError(res, data);
    if (res.status === 504 || (looksLikeHtml && res.status >= 500)) {
      const e = new Error("Exam generation timed out on the server. Please try again.");
      e.code = "gateway_timeout";
      throw e;
    }
    if (res.status === 429 && data.error === "quota_exceeded") {
      const e = new Error("quota_exceeded");
      e.code = "quota_exceeded";
      e.used = data.used;
      e.max = data.max;
      e.plan = data.plan;
      throw e;
    }
    if (res.status === 402 && data.error === "ai_credits_exhausted") {
      if (typeof showAiCreditsExhausted === "function") {
        showAiCreditsExhausted({
          autoRechargeFailed: data.autoRechargeFailed,
          reason: data.reason,
        });
      }
      const e = new Error("ai_credits_exhausted");
      e.code = "ai_credits_exhausted";
      e.remaining = data.remaining;
      e.aiUsed = data.aiUsed;
      e.aiMax = data.aiMax;
      throw e;
    }
    if (res.status === 422 && data.error === 'exam_chunk_unparseable') {
      const e = new Error('exam_chunk_unparseable');
      e.code = 'exam_chunk_unparseable';
      e.teil = data.teil;
      e.stopReason = data.stop_reason;
      throw e;
    }
    if (res.status === 422 && data.error === 'exam_low_quality') {
      const e = new Error('exam_low_quality');
      e.code = 'exam_low_quality';
      throw e;
    }
    if (res.status === 422 && data.error === 'exam_invalid') {
      const e = new Error(data.message || 'exam_invalid');
      e.code = 'exam_invalid';
      throw e;
    }
    if (res.status === 502 || res.status === 503) {
      const e = new Error('AI service temporarily unavailable. Please try again in a moment.');
      e.code = 'ai_unavailable';
      throw e;
    }
    if (res.status === 400 && (data.error || '').toLowerCase().includes('model')) {
      const e = new Error('AI model configuration error. Please contact support.');
      e.code = 'model_error';
      throw e;
    }
    throw new Error(data.error || data.message || `AI service error (${res.status})`);
  }

  if (!data.text) {
    throw new Error(data.error || "Empty AI response");
  }

  if (examGeneration && data.model) {
    lcDebug.log("[claude] exam generation model:", data.model);
  }

  if (typeof window.applyServerQuota === "function") {
    window.applyServerQuota(data);
  }
  applyAiCreditsFromResponse(data);

  return data.text;
}

function applyAiCreditsFromResponse(data) {
  if (!data || typeof window.applyServerQuota !== "function") return;
  if (
    typeof data.aiUsed === "number" ||
    typeof data.aiRemaining === "number" ||
    typeof data.used === "number"
  ) {
    window.applyServerQuota(data);
  }
}

async function postClaudeFeature(body, timeoutMs = 35000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await lcFetch(CLAUDE_ENDPOINT, {
      method: "POST",
      headers: aiAuthHeaders(),
      body: JSON.stringify({ ...body, consumeQuota: false }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      const e = new Error("AI request timed out");
      e.code = "timeout";
      throw e;
    }
    throw err;
  }
  clearTimeout(timer);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 402 && data.error === "ai_credits_exhausted") {
      if (typeof showAiCreditsExhausted === "function") {
        showAiCreditsExhausted({
          autoRechargeFailed: data.autoRechargeFailed,
          reason: data.reason,
        });
      }
      const e = new Error("ai_credits_exhausted");
      e.code = "ai_credits_exhausted";
      e.remaining = data.remaining;
      throw e;
    }
    if (res.status === 403 && data.error === "pro_only") {
      const e = new Error("pro_only");
      e.code = "pro_only";
      throw e;
    }
    throw new Error(data.error || `AI service error (${res.status})`);
  }
  return data;
}

async function correctWritingWithAI(lang, level, task, userText, opts = {}) {
  if (!String(userText || "").trim()) return null;
  try {
    const data = await postClaudeFeature({
      correctWriting: true,
      aiAction: 'writing_correction',
      lang,
      level,
      task: String(task || ''),
      userText: String(userText),
      minWords: opts.minWords,
      maxWords: opts.maxWords,
    });
    applyAiCreditsFromResponse(data);
    return data.ok ? data.correction : null;
  } catch (err) {
    if (err.code === 'ai_credits_exhausted') {
      if (typeof showAiCreditsExhausted === 'function') showAiCreditsExhausted();
      return null;
    }
    lcDebug.warn("[writing-ai] correction failed:", err.message);
    return null;
  }
}

async function genGrammarCoaching(lang, level, weakTags, sampleMistakes) {
  if (!weakTags?.length && !sampleMistakes?.length) return null;
  try {
    const data = await postClaudeFeature({
      grammarCoaching: true,
      aiAction: 'grammar_coaching',
      lang,
      level,
      weakTags: weakTags || [],
      sampleMistakes: (sampleMistakes || []).slice(0, 8),
    });
    applyAiCreditsFromResponse(data);
    return data.ok ? data.coaching : null;
  } catch (err) {
    if (err.code === 'ai_credits_exhausted') {
      if (typeof showAiCreditsExhausted === 'function') showAiCreditsExhausted();
      return null;
    }
    if (err.code === "pro_only") return null;
    lcDebug.warn("[pdf] grammar coaching failed:", err.message);
    return null;
  }
}

async function consumeAiAction(action, requestId) {
  const rid =
    requestId || `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  try {
    const data = await postClaudeFeature({
      consumeAiAction: true,
      action,
      requestId: rid,
    });
    applyAiCreditsFromResponse(data);
    return data.ok === true;
  } catch (err) {
    if (err.code === 'ai_credits_exhausted' && typeof showAiCreditsExhausted === 'function') {
      showAiCreditsExhausted();
    }
    if (err.code === 'pro_only' && typeof showUpgrade === 'function') showUpgrade();
    lcDebug.warn('[ai-credits] consume failed:', err.message);
    return false;
  }
}

async function generateVocabQuizWithAI(words, opts = {}) {
  const list = [...new Set((words || []).map((w) => String(w || '').trim()).filter(Boolean))];
  if (list.length < 4) {
    const e = new Error('need_at_least_4_words');
    e.code = 'need_at_least_4_words';
    throw e;
  }
  const count = Math.min(Math.max(Number(opts.count) || 10, 1), 10, list.length);
  const requestId =
    opts.requestId ||
    `vq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const data = await postClaudeFeature(
    {
      generateVocabQuiz: true,
      aiAction: 'vocab_quiz',
      lang: opts.lang || 'de',
      level: opts.level || 'B1',
      hintLang: opts.hintLang || 'en',
      hintLanguageMode: opts.hintLanguageMode || 'interface',
      words: list,
      wordMeta: opts.wordMeta || [],
      preferTargets: opts.preferTargets || [],
      count,
      requestId,
    },
    opts.timeoutMs || 45000,
  );
  applyAiCreditsFromResponse(data);
  if (!data.ok || !Array.isArray(data.questions) || !data.questions.length) {
    const e = new Error(data.error || 'vocab_quiz_failed');
    e.code = data.error || 'vocab_quiz_failed';
    throw e;
  }
  return data.questions;
}

async function generateListeningGameWithAI(words, opts = {}) {
  const list = [...new Set((words || []).map((w) => String(w || '').trim()).filter(Boolean))];
  if (list.length < 3) {
    const e = new Error('need_at_least_3_words');
    e.code = 'need_at_least_3_words';
    throw e;
  }
  const requestId =
    opts.requestId ||
    `lg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const data = await postClaudeFeature(
    {
      generateListeningGame: true,
      aiAction: 'listening_game',
      lang: opts.lang || 'de',
      level: opts.level || 'B1',
      topic: opts.topic || '',
      words: list,
      requestId,
    },
    opts.timeoutMs || 60000,
  );
  applyAiCreditsFromResponse(data);
  if (!data.ok || !data.passage) {
    const e = new Error(data.error || 'listening_game_failed');
    e.code = data.error || 'listening_game_failed';
    throw e;
  }
  return data;
}

async function generateVocabPhrasesWithAI(words, opts = {}) {
  const list = [...new Set((words || []).map((w) => String(w || '').trim()).filter(Boolean))];
  if (list.length < 2) {
    const e = new Error('need_at_least_2_words');
    e.code = 'need_at_least_2_words';
    throw e;
  }
  const requestId =
    opts.requestId ||
    `vp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const data = await postClaudeFeature(
    {
      generateVocabPhrases: true,
      aiAction: 'vocab_phrases',
      lang: opts.lang || 'de',
      level: opts.level || 'B1',
      words: list,
      count: Math.min(5, Math.max(3, Number(opts.count) || 4)),
      requestId,
    },
    opts.timeoutMs || 50000,
  );
  applyAiCreditsFromResponse(data);
  if (!data.ok || !Array.isArray(data.phrases) || !data.phrases.length) {
    const e = new Error(data.error || 'vocab_phrases_failed');
    e.code = data.error || 'vocab_phrases_failed';
    throw e;
  }
  return data.phrases;
}

async function confirmStripePurchase(sessionId) {
  const res = await lcFetch("/.netlify/functions/stripe-confirm", {
    method: "POST",
    headers: aiAuthHeaders(),
    body: JSON.stringify({ session_id: sessionId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || "stripe_confirm_failed");
    e.code = data.error || "stripe_confirm_failed";
    throw e;
  }
  if (data.user && typeof window.applyUserFromServer === "function") {
    window.applyUserFromServer(data.user);
  } else if (data.user?.quota && typeof window.applyServerQuota === "function") {
    window.applyServerQuota({
      used: data.user.quota.used,
      max: data.user.quota.max,
      plan: data.user.plan,
    });
  }
  return data;
}

async function startOfficialExamTimer(opts = {}) {
  const res = await lcFetch("/.netlify/functions/exam-official-timer", {
    method: "POST",
    headers: aiAuthHeaders(),
    body: JSON.stringify({
      action: "start",
      examSavedId: opts.examSavedId,
      limitMinutes: opts.limitMinutes,
      goalId: opts.goalId || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return data;
}

async function finishOfficialExamTimer(opts = {}) {
  const res = await lcFetch("/.netlify/functions/exam-official-timer", {
    method: "POST",
    headers: aiAuthHeaders(),
    body: JSON.stringify({
      action: "finish",
      examSavedId: opts.examSavedId,
      timerSessionId: opts.timerSessionId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return data;
}

async function commitExamQuota() {
  if (!commitExamQuota._pendingId && typeof crypto !== 'undefined' && crypto.randomUUID) {
    commitExamQuota._pendingId = crypto.randomUUID();
  }
  const requestId = commitExamQuota._pendingId || null;
  const res = await lcFetch(CLAUDE_ENDPOINT, {
    method: "POST",
    headers: aiAuthHeaders(),
    body: JSON.stringify({ quotaOnly: true, requestId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429 && data.error === "quota_exceeded") {
      const e = new Error("quota_exceeded");
      e.code = "quota_exceeded";
      e.used = data.used;
      e.max = data.max;
      e.plan = data.plan;
      throw e;
    }
    throw new Error(data.error || "Could not register exam usage");
  }
  commitExamQuota._pendingId = null;
  if (typeof window.applyServerQuota === 'function') {
    window.applyServerQuota(data);
  }
  if (typeof data.used !== 'number' && typeof window.applyServerQuota === 'function') {
    window.applyServerQuota({
      used: (typeof window.getQuotaUsed === 'function' ? window.getQuotaUsed() : 0) + 1,
      plan: data.plan || (typeof S !== 'undefined' ? S.plan : undefined),
    });
  }
  if (typeof window.updQuotaUI === 'function') window.updQuotaUI();
  if (typeof window.refreshUserDropdown === 'function') window.refreshUserDropdown();
}

async function commitPersonalPoolQuota(module) {
  const mod = String(module || '').toLowerCase();
  if (mod !== 'lesen' && mod !== 'horen') throw new Error('invalid_personal_pool_module');
  if (!commitPersonalPoolQuota._pendingIds) commitPersonalPoolQuota._pendingIds = {};
  if (!commitPersonalPoolQuota._pendingIds[mod] && typeof crypto !== 'undefined' && crypto.randomUUID) {
    commitPersonalPoolQuota._pendingIds[mod] = crypto.randomUUID();
  }
  const requestId = commitPersonalPoolQuota._pendingIds[mod] || null;
  const res = await lcFetch(CLAUDE_ENDPOINT, {
    method: "POST",
    headers: aiAuthHeaders(),
    body: JSON.stringify({ personalPoolCommit: mod, requestId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429 && data.error === 'personal_pool_quota_exceeded') {
      const e = new Error('personal_pool_quota_exceeded');
      e.code = 'personal_pool_quota_exceeded';
      e.used = data.used;
      e.max = data.max;
      e.plan = data.plan;
      e.module = data.module || mod;
      throw e;
    }
    throw new Error(data.error || 'Could not register personal pool usage');
  }
  commitPersonalPoolQuota._pendingIds[mod] = null;
  if (typeof window.applyServerQuota === 'function') {
    window.applyServerQuota(data);
  }
  return data;
}

const VOCAB_CACHE_ENDPOINT = "/.netlify/functions/vocab-cache";

async function fetchExamFromPool(lang, level, excludeIds) {
  const params = { lang, level };
  if (excludeIds && excludeIds.length) {
    params.exclude = excludeIds.slice(0, 40).join(",");
  }
  const q = new URLSearchParams(params);
  const res = await lcFetch(`/.netlify/functions/exam-pool?${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.found) return null;
  return data;
}

function resolveAssembleModeForPool() {
  if (typeof isOfficialMode === 'function' && isOfficialMode()) return 'official';
  if (typeof isPracticeMode === 'function' && isPracticeMode()) return 'practice';
  if (typeof S !== 'undefined') {
    const m = String(S.mode || 'practice').toLowerCase();
    return m === 'official' || m === 'real' ? 'official' : 'practice';
  }
  return 'practice';
}

/**
 * Fetch a reusable exam section (part) from the parts store.
 * Returns the part payload or null if nothing is available.
 * Never throws — callers treat null as "no cached part, fall back to AI".
 */
async function fetchExamPart(lang, level, module, excludeIds, teil) {
  const params = { lang, level, module, assembleMode: resolveAssembleModeForPool() };
  if (excludeIds && excludeIds.length) {
    params.exclude = excludeIds.slice(0, 40).join(",");
  }
  if (teil != null && Number.isFinite(Number(teil))) {
    params.teil = String(Number(teil));
  }
  const q = new URLSearchParams(params);
  try {
    const res = await lcFetch(`/.netlify/functions/exam-part?${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data.part || null;
  } catch (_) {
    return null;
  }
}

/**
 * Igual que fetchExamPart pero consciente de vocabulario (A.2) y devuelve el objeto
 * completo: { part, id, coveredWords, coverage, topic, requestedLemmas } o null.
 */
async function fetchExamPartVocab(lang, level, module, opts = {}) {
  const {
    excludeIds = [],
    teil = null,
    words = [],
    excludeTopics = [],
    topicTag = null,
    poolRequestId = null,
  } = opts;
  const params = {
    lang, level, module,
    assembleMode: opts.assembleMode || resolveAssembleModeForPool(),
  };
  if (excludeIds.length) params.exclude = excludeIds.slice(0, 40).join(",");
  if (teil != null && Number.isFinite(Number(teil))) params.teil = String(Number(teil));
  if (words.length) params.words = words.slice(0, 40).join(",");
  if (excludeTopics.length) params.excludeTopics = excludeTopics.slice(0, 20).join(",");
  if (topicTag) params.topicTag = String(topicTag);
  if (poolRequestId) params.poolRequestId = String(poolRequestId);
  const q = new URLSearchParams(params);
  try {
    const res = await lcFetch(`/.netlify/functions/exam-part?${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        const e = new Error(data.error || 'login_required');
        e.code = 'login_required';
        throw e;
      }
      if (res.status === 429 && data.error === 'personal_pool_quota_exceeded') {
        const e = new Error('personal_pool_quota_exceeded');
        e.code = 'personal_pool_quota_exceeded';
        e.used = data.used;
        e.max = data.max;
        e.plan = data.plan;
        e.module = data.module || module;
        throw e;
      }
      if (res.status === 429 && data.error === 'rate_limited') {
        const e = new Error('rate_limited');
        e.code = 'rate_limited';
        throw e;
      }
      return null;
    }
    if (!data.part) return null;
    if (typeof window !== 'undefined' && typeof window.applyServerQuota === 'function') {
      if (data.personalLesenUsed != null || data.personalHorenUsed != null) {
        window.applyServerQuota(data);
      }
    }
    return {
      part: data.part,
      id: data.id || data.part.id || null,
      coveredWords: data.coveredWords || [],
      coverage: data.coverage || null,
      topic: data.topic || data.part.topic || null,
      topicTag: data.topicTag || data.part.topicTag || null,
      topicRelaxed: !!data.topicRelaxed,
      requestedLemmas: data.requestedLemmas || [],
    };
  } catch (err) {
    if (err?.code === 'login_required' || err?.code === 'personal_pool_quota_exceeded' || err?.code === 'rate_limited') {
      throw err;
    }
    return null;
  }
}

async function fetchVocabCache(from, to, text, context, signal) {
  const params = new URLSearchParams({ from, to, text: String(text || "") });
  const ctx = String(context || "").trim();
  if (ctx) params.set("context", ctx.slice(0, 4000));
  const ctrl = signal ? null : typeof AbortController !== "undefined" ? new AbortController() : null;
  const useSignal = signal || ctrl?.signal;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 11000) : null;
  try {
    const res = await lcFetch(`${VOCAB_CACHE_ENDPOINT}?${params}`, useSignal ? { signal: useSignal } : {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { found: false, reason: data.reason || data.error || `http_${res.status}` };
    if (!data.found) return { found: false, reason: data.reason || "miss" };
    return data;
  } catch (err) {
    if (err?.name === "AbortError") return { found: false, reason: "aborted" };
    return { found: false, reason: "network" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * AI lemma fallback for German separables when allowlist reunify failed.
 * Cached server-side (vocab-cache action=lemma).
 */
async function fetchVocabLemma(surface, context, signal) {
  if (typeof window !== "undefined") {
    window.__lexicoilLemmaAiCalls = (window.__lexicoilLemmaAiCalls || 0) + 1;
  }
  const params = new URLSearchParams({
    action: "lemma",
    from: "de",
    text: String(surface || ""),
    context: String(context || "").slice(0, 4000),
  });
  const ctrl = signal ? null : typeof AbortController !== "undefined" ? new AbortController() : null;
  const useSignal = signal || ctrl?.signal;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 11000) : null;
  try {
    const res = await lcFetch(`${VOCAB_CACHE_ENDPOINT}?${params}`, useSignal ? { signal: useSignal } : {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { found: false, reason: data.reason || data.error || `http_${res.status}` };
    if (!data.found || !data.lemma) return { found: false, reason: data.reason || "miss" };
    // Client-side junk guard (same family as MyMemory spam filter)
    const lemma = String(data.lemma || "").trim();
    if (/^https?:\/\//i.test(lemma) || /\bhttps?:\/\//i.test(lemma)) {
      return { found: false, reason: "junk_translation" };
    }
    return { found: true, lemma, source: data.source || "gemini" };
  } catch (err) {
    if (err?.name === "AbortError") return { found: false, reason: "aborted" };
    return { found: false, reason: "network" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * AI der/die/das fallback when ArticleLexicon misses (cached server-side).
 * @param {string} word
 * @param {{ likelyPlural?: boolean, signal?: AbortSignal }} [opts]
 */
async function fetchVocabGender(word, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const signal = o.signal;
  if (typeof window !== "undefined") {
    window.__lexicoilGenderAiCalls = (window.__lexicoilGenderAiCalls || 0) + 1;
  }
  const params = new URLSearchParams({
    action: "gender",
    from: "de",
    text: String(word || ""),
  });
  if (o.likelyPlural) params.set("likelyPlural", "1");
  const ctrl = signal ? null : typeof AbortController !== "undefined" ? new AbortController() : null;
  const useSignal = signal || ctrl?.signal;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 11000) : null;
  try {
    const res = await lcFetch(`${VOCAB_CACHE_ENDPOINT}?${params}`, useSignal ? { signal: useSignal } : {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { found: false, reason: data.reason || data.error || `http_${res.status}` };
    if (!data.found || !data.article) return { found: false, reason: data.reason || "miss" };
    const article = String(data.article || "").trim().toLowerCase();
    if (!/^(der|die|das)$/.test(article)) return { found: false, reason: "junk_response" };
    const gender =
      data.gender ||
      (article === "der" ? "m" : article === "die" ? "f" : article === "das" ? "n" : null);
    return {
      found: true,
      article,
      gender,
      plural: !!data.plural,
      source: data.source || "gemini",
    };
  } catch (err) {
    if (err?.name === "AbortError") return { found: false, reason: "aborted" };
    return { found: false, reason: "network" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function putVocabCache(from, to, text, translation, source = "manual") {
  const res = await lcFetch(VOCAB_CACHE_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, text, translation, source }),
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return !!data.saved;
}

const TTS_ENDPOINT = "/.netlify/functions/tts";

function ttsVoiceForLang(lang) {
  const l = String(lang || "en").slice(0, 2).toLowerCase();
  if (l === "de") return "de-DE";
  if (l === "es") return "es-ES";
  return "en-GB";
}

/** Must match netlify/functions/lib/ttsCacheLib.js normalizeTtsInput (hash lowercases internally). */
function normalizeTtsQueryText(text) {
  return String(text || "")
    .replace(/[■●▲►◆]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function ttsTextHashClient(text) {
  const normalized = normalizeTtsQueryText(text).toLowerCase();
  if (!globalThis.crypto?.subtle) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function ttsCacheVoiceCandidates(voice, lang) {
  const out = [];
  const add = (v) => {
    const s = String(v || "").trim().slice(0, 32);
    if (s && !out.includes(s)) out.push(s);
  };
  add(voice || ttsVoiceForLang(lang));
  const l = String(lang || "en").slice(0, 2).toLowerCase();
  if (l === "de") add("de-DE");
  else if (l === "es") add("es-ES");
  else add("en-GB");
  return out;
}

async function fetchStaticTtsUrl(text, voice, lang) {
  const hash = await ttsTextHashClient(text);
  if (!hash) return null;
  for (const v of ttsCacheVoiceCandidates(voice, lang)) {
    const url = `/library/tts-cache/${v}_${hash}.mp3`;
    try {
      const res = await fetch(url, { method: "GET", cache: "force-cache" });
      if (res.ok && res.headers.get("content-type")?.includes("audio")) return url;
      if (res.ok && (Number(res.headers.get("content-length")) || 0) > 128) return url;
    } catch (_) {
      /* try next voice */
    }
  }
  return null;
}

async function fetchTtsAudio(text, voice, lang) {
  const normalized = normalizeTtsQueryText(text);
  const staticUrl = await fetchStaticTtsUrl(normalized, voice, lang);
  if (staticUrl) return { found: true, url: staticUrl, source: "static" };

  const res = await lcFetch(TTS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: normalized,
      voice: voice || ttsVoiceForLang(lang),
      lang: lang || "",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn("[TTS] API lookup failed:", res.status, data.error || data);
    return null;
  }
  if (!data.found || !data.audioBase64) {
    console.warn("[TTS] cache miss for", normalized.length, "chars");
    return null;
  }
  return { ...data, source: "api" };
}

async function generateTtsAudio(text, voice, lang) {
  if (localStorage.getItem("lc_guest") === "1") return { unavailable: true, error: "guest" };
  const normalized = normalizeTtsQueryText(text);
  const res = await lcFetch(TTS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: normalized,
      voice: voice || ttsVoiceForLang(lang),
      lang: lang || "",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data.error === "token_revoked") {
      if (typeof Auth !== "undefined" && typeof Auth.handleTokenRevoked === "function") {
        Auth.handleTokenRevoked();
      }
      return { unavailable: true, error: "token_revoked" };
    }
    // B-6: surface AI credit exhaustion distinctly so UI can show a helpful message
    if (res.status === 402 && data.error === "ai_credits_exhausted") {
      if (typeof showAiCreditsExhausted === "function") {
        showAiCreditsExhausted({
          autoRechargeFailed: data.autoRechargeFailed,
          reason: data.reason,
        });
      }
      return { unavailable: true, error: data.error };
    }
    return { unavailable: true, error: data.error || "tts_failed" };
  }
  if (data.found && data.audioBase64) return data;
  return null;
}

async function saveExamPartsToStaging(lang, level, exam, opts = {}) {
  if (exam?.vocabPersonal || exam?.vocabWords?.length) return { error: "personal_exam" };
  if (localStorage.getItem("lc_guest") === "1") return { error: "guest" };
  const res = await lcFetch("/.netlify/functions/content-staging", {
    method: "POST",
    headers: aiAuthHeaders(),
    body: JSON.stringify({
      lang,
      level,
      exam,
      complete: !!opts.complete,
      autoApprove: !!opts.autoApprove,
      verified: !!opts.verified,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    lcDebug.warn("[staging] ingest failed:", data.error || res.status, data);
    return { error: data.error || `http_${res.status}`, details: data };
  }
  return data;
}

async function saveExamToPool(lang, level, topic, exam) {
  const t = String(topic || "").trim();
  if (/personal\s*vocabulary|^personal:/i.test(t)) return;
  if (exam?.vocabPersonal || exam?.vocabWords?.length) return;
  if (typeof ExamValidator !== "undefined") {
    const strict = typeof window !== "undefined" && window.LC_VALIDATOR_STRICT === "1";
    const check = new ExamValidator().validate(exam, { strict });
    if (!check.valid) {
      lcDebug.warn("[pool] rejected invalid exam:", check.errors);
      return;
    }
  }
  const res = await lcFetch("/.netlify/functions/exam-pool", {
    method: "POST",
    body: JSON.stringify({ lang, level, topic: t, exam }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "pool_save_failed");
  }
}

async function startStripeCheckout(opts = {}) {
  if (typeof Auth !== "undefined" && Auth.isGuest && Auth.isGuest()) throw new Error("login_required");
  if (typeof LcAnalytics !== "undefined") {
    LcAnalytics.trackUpgradeClicked(opts && opts.plan ? opts.plan : "pro");
  }
  const body = opts && opts.plan ? { plan: opts.plan } : {};
  const res = await lcFetch("/.netlify/functions/stripe-checkout", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "checkout_failed");
  if (!data.url) throw new Error("checkout_failed");
  window.location.href = data.url;
}

async function startStripePortal() {
  if (typeof Auth !== "undefined" && Auth.isGuest && Auth.isGuest()) throw new Error("login_required");
  const res = await lcFetch("/.netlify/functions/stripe-portal", {
    method: "POST",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || "portal_failed");
    e.code = data.error || "portal_failed";
    throw e;
  }
  if (!data.url) throw new Error("portal_failed");
  window.location.href = data.url;
}

if (typeof window !== "undefined") {
  window.aiAuthHeaders = aiAuthHeaders;
  window.lcFetch = lcFetch;
  window.commitExamQuota = commitExamQuota;
  window.commitPersonalPoolQuota = commitPersonalPoolQuota;
  window.normalizeTtsQueryText = normalizeTtsQueryText;
  window.fetchTtsAudio = fetchTtsAudio;
  window.generateTtsAudio = generateTtsAudio;
  window.ttsVoiceForLang = ttsVoiceForLang;
  window.startStripeCheckout = startStripeCheckout;
  window.fetchHybridExamPlan = fetchHybridExamPlan;
  window.executeHybridLesenExam = executeHybridLesenExam;
  window.fetchExamPart = fetchExamPart;
  window.fetchExamPartVocab = fetchExamPartVocab;
  window.startOfficialExamTimer = startOfficialExamTimer;
  window.finishOfficialExamTimer = finishOfficialExamTimer;
}
