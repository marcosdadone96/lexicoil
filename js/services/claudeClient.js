const CLAUDE_ENDPOINT = "/.netlify/functions/claude-chat";

function aiAuthHeaders() {
  const h = { "Content-Type": "application/json" };
  const token = localStorage.getItem("lc_token");
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function callAI(prompt, maxTokens = 6000, options = {}) {
  const { consumeQuota = true, timeoutMs = 35000, examGeneration = false } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(CLAUDE_ENDPOINT, {
      method: "POST",
      headers: aiAuthHeaders(),
      body: JSON.stringify({ prompt, maxTokens, consumeQuota, examGeneration }),
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

  if (typeof data.used === "number" && typeof window.applyServerQuota === "function") {
    window.applyServerQuota(data);
  }

  return data.text;
}

async function confirmStripePurchase(sessionId) {
  const res = await fetch("/.netlify/functions/stripe-confirm", {
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
  const res = await fetch(CLAUDE_ENDPOINT, {
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
  if (typeof data.used === "number" && typeof window.applyServerQuota === "function") {
    window.applyServerQuota({ used: data.used, max: data.max, plan: data.plan });
  }
}

const VOCAB_CACHE_ENDPOINT = "/.netlify/functions/vocab-cache";

async function fetchExamFromPool(lang, level, excludeIds) {
  const params = { lang, level };
  if (excludeIds && excludeIds.length) {
    params.exclude = excludeIds.slice(0, 40).join(",");
  }
  const q = new URLSearchParams(params);
  const res = await fetch(`/.netlify/functions/exam-pool?${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.found) return null;
  return data;
}

async function fetchVocabCache(from, to, text) {
  const params = new URLSearchParams({ from, to, text: String(text || "") });
  const res = await fetch(`${VOCAB_CACHE_ENDPOINT}?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.found) return null;
  return data;
}

async function putVocabCache(from, to, text, translation, source = "manual") {
  const res = await fetch(VOCAB_CACHE_ENDPOINT, {
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
  const res = await fetch(`${TTS_ENDPOINT}?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.found || !data.audioBase64) return null;
  return data;
}

async function generateTtsAudio(text, voice, lang) {
  const token = localStorage.getItem("lc_token");
  const headers = { "Content-Type": "application/json" };
  if (token && localStorage.getItem("lc_guest") !== "1") {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(TTS_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text: String(text || ""),
      voice: voice || ttsVoiceForLang(lang),
      lang: lang || "",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { unavailable: true, error: data.error };
  if (data.unavailable) return { unavailable: true };
  if (data.found && data.audioBase64) return data;
  return null;
}

async function saveExamPartsToStaging(lang, level, exam, opts = {}) {
  if (exam?.vocabPersonal || exam?.vocabWords?.length) return null;
  const token = localStorage.getItem("lc_token");
  if (!token || localStorage.getItem("lc_guest") === "1") return null;
  const res = await fetch("/.netlify/functions/content-staging", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      lang,
      level,
      exam,
      complete: !!opts.complete,
      autoApprove: !!opts.autoApprove,
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
  const token = localStorage.getItem("lc_token");
  const headers = { "Content-Type": "application/json" };
  if (token && localStorage.getItem("lc_guest") !== "1") {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch("/.netlify/functions/exam-pool", {
    method: "POST",
    headers,
    body: JSON.stringify({ lang, level, topic: t, exam }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "pool_save_failed");
  }
}

async function startStripeCheckout() {
  const token = localStorage.getItem("lc_token");
  if (!token) throw new Error("login_required");
  const res = await fetch("/.netlify/functions/stripe-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "checkout_failed");
  if (!data.url) throw new Error("checkout_failed");
  window.location.href = data.url;
}

async function startStripePortal() {
  const token = localStorage.getItem("lc_token");
  if (!token) throw new Error("login_required");
  const res = await fetch("/.netlify/functions/stripe-portal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
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
