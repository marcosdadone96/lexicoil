const CLAUDE_ENDPOINT = "/.netlify/functions/claude-chat";

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

async function callAI(prompt, maxTokens = 6000, options = {}) {
  const defaultTimeout = options.examGeneration ? 55000 : 35000;
  const { timeoutMs = defaultTimeout, examGeneration = false, aiAction = null, genTicket = null } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await lcFetch(CLAUDE_ENDPOINT, {
      method: "POST",
      headers: aiAuthHeaders(),
      body: JSON.stringify({ prompt, maxTokens, examGeneration, aiAction, genTicket }),
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
  if (typeof window.applyServerQuota === "function") {
    window.applyServerQuota(data);
  }
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

/**
 * Fetch a reusable exam section (part) from the parts store.
 * Returns the part payload or null if nothing is available.
 * Never throws — callers treat null as "no cached part, fall back to AI".
 */
async function fetchExamPart(lang, level, module, excludeIds) {
  const params = { lang, level, module };
  if (excludeIds && excludeIds.length) {
    params.exclude = excludeIds.slice(0, 40).join(",");
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

async function fetchVocabCache(from, to, text) {
  const params = new URLSearchParams({ from, to, text: String(text || "") });
  const res = await lcFetch(`${VOCAB_CACHE_ENDPOINT}?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.found) return null;
  return data;
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

async function fetchTtsAudio(text, voice, lang) {
  const params = new URLSearchParams({
    text: String(text || ""),
    voice: voice || ttsVoiceForLang(lang),
    lang: lang || "",
  });
  const res = await lcFetch(`${TTS_ENDPOINT}?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.found || !data.audioBase64) return null;
  return data;
}

async function generateTtsAudio(text, voice, lang) {
  if (localStorage.getItem("lc_guest") === "1") return { unavailable: true, error: "guest" };
  const res = await lcFetch(TTS_ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      text: String(text || ""),
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
  if (exam?.vocabPersonal || exam?.vocabWords?.length) return null;
  if (localStorage.getItem("lc_guest") === "1") return null;
  const res = await lcFetch("/.netlify/functions/content-staging", {
    method: "POST",
    body: JSON.stringify({
      lang,
      level,
      exam,
      complete: !!opts.complete,
      autoApprove: !!opts.autoApprove,
      // Signal that the client ran AI answer-key verification (EXAM_ANSWER_KEY_VERIFY=1)
      // → server will auto-approve valid parts to the reusable-parts store immediately.
      verified: !!opts.verified,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    lcDebug.warn("[staging] ingest failed:", data.error || res.status);
    return null;
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

async function startStripeCheckout() {
  if (typeof Auth !== "undefined" && Auth.isGuest && Auth.isGuest()) throw new Error("login_required");
  const res = await lcFetch("/.netlify/functions/stripe-checkout", {
    method: "POST",
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
}
