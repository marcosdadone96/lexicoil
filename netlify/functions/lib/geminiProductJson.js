'use strict';

/**
 * Gemini generation for live product (quiz, listening, Schreiben, exams, verify gates).
 */
const { acquire, DailyQuotaError, isDailyQuotaMessage } = require('./geminiRateLimit.js');
const { geminiApiKey } = require('./freeTranslate.js');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = Number(process.env.GEMINI_PRODUCT_TIMEOUT_MS) || 45000;
const EXAM_TIMEOUT_MS = Number(process.env.GEMINI_EXAM_TIMEOUT_MS) || 120000;

function fetchTimeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function productGeminiModel() {
  return (
    String(process.env.GEMINI_PRODUCT_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() ||
    DEFAULT_MODEL
  );
}

function verifyGeminiModel() {
  return String(process.env.GEMINI_VERIFY_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
}

function examGeminiModel() {
  return String(process.env.GEMINI_EXAM_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
}

function speakingGeminiModel() {
  return String(
    process.env.GEMINI_SPEAKING_MODEL ||
      process.env.GEMINI_PRODUCT_MODEL ||
      process.env.GEMINI_MODEL ||
      DEFAULT_MODEL,
  ).trim();
}

/** Merge consecutive same-role turns (Gemini requires user/model alternation). */
function normalizeGeminiContents(messages) {
  const out = [];
  for (const m of messages || []) {
    const role = m.role === 'assistant' || m.role === 'model' ? 'model' : 'user';
    const text = String(m.content ?? m.text ?? '').trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n\n${text}`;
    } else {
      out.push({ role, parts: [{ text }] });
    }
  }
  if (out.length && out[0].role !== 'user') {
    out.unshift({ role: 'user', parts: [{ text: '(Session start)' }] });
  }
  return out;
}

/**
 * Multi-turn partner chat (Sprechen turn-based). messages: { role: 'user'|'assistant', content }[].
 */
async function callGeminiPartnerChat({ system, messages, maxTokens, model }) {
  const key = geminiApiKey();
  if (!key) {
    const err = new Error('gemini_key_missing');
    err.code = 'gemini_key_missing';
    throw err;
  }
  await acquire();
  const modelId = String(model || speakingGeminiModel()).trim() || speakingGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`;
  const contents = normalizeGeminiContents(messages);
  if (!contents.length) {
    const err = new Error('empty_chat_messages');
    throw err;
  }
  const payload = {
    contents,
    generationConfig: {
      ...generationConfigFor(modelId, maxTokens || 200, false),
      temperature: 0.65,
    },
  };
  delete payload.generationConfig.responseMimeType;
  const sys = String(system || '').trim();
  if (sys) payload.systemInstruction = { parts: [{ text: sys }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: fetchTimeoutSignal(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) {
    const msg = data?.error?.message || 'Rate limit exceeded';
    const err = new Error(msg);
    err.status = 429;
    err.daily = isDailyQuotaMessage(msg);
    throw err;
  }
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  if (!text) throw new Error('empty_gemini_response');
  return {
    text,
    model: modelId,
    usage: data?.usageMetadata || null,
  };
}

/** @deprecated pass-through: gates accept legacy apiKey param but always use Gemini. */
function resolveLiveLlmKey(_legacyApiKey) {
  return geminiApiKey();
}

function generationConfigFor(modelId, maxOutputTokens, jsonMode = true) {
  const cap = 8192;
  const cfg = {
    temperature: 0.25,
    maxOutputTokens: Math.min(Math.max(Number(maxOutputTokens) || 2048, 256), cap),
  };
  if (jsonMode) cfg.responseMimeType = 'application/json';
  const id = String(modelId || '');
  if (id.includes('2.5-flash') && !id.includes('lite')) {
    cfg.thinkingConfig = { thinkingBudget: 0 };
  }
  return cfg;
}

function rejectMissingGeminiKey(jsonResponse, cors) {
  if (geminiApiKey()) return null;
  return jsonResponse(503, cors, {
    error: 'gemini_key_missing',
    billed: false,
    userMessage: 'AI is temporarily unavailable. Please try again later.',
  });
}

async function callGeminiGenerate({
  system,
  userContent,
  maxTokens,
  model,
  jsonMode = true,
  timeoutMs = TIMEOUT_MS,
}) {
  const key = geminiApiKey();
  if (!key) {
    const err = new Error('gemini_key_missing');
    err.code = 'gemini_key_missing';
    throw err;
  }

  await acquire();

  const modelId = String(model || productGeminiModel()).trim() || productGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: String(userContent || '') }] }],
    generationConfig: generationConfigFor(modelId, maxTokens, jsonMode),
  };
  const sys = String(system || '').trim();
  if (sys) {
    payload.systemInstruction = { parts: [{ text: sys }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: fetchTimeoutSignal(timeoutMs),
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 429) {
    const msg = data?.error?.message || 'Rate limit exceeded';
    const err = new Error(msg);
    err.status = 429;
    err.daily = isDailyQuotaMessage(msg);
    throw err;
  }

  if (!res.ok) {
    const msg = data?.error?.message || res.statusText || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    if (res.status === 400 && /api key not valid/i.test(msg)) err.code = 'invalid_api_key';
    throw err;
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  const usage = data?.usageMetadata || null;
  if (!text) {
    const err = new Error('empty_gemini_response');
    err.finishReason = data?.candidates?.[0]?.finishReason;
    throw err;
  }
  return { text, model: modelId, usage };
}

async function callGeminiProductJson(opts) {
  return callGeminiGenerate({ ...opts, jsonMode: opts.jsonMode !== false });
}

async function callGeminiUserPrompt({ userContent, maxTokens, model, jsonMode = true, timeoutMs }) {
  return callGeminiGenerate({ userContent, maxTokens, model, jsonMode, timeoutMs, system: '' });
}

module.exports = {
  callGeminiProductJson,
  callGeminiUserPrompt,
  callGeminiGenerate,
  rejectMissingGeminiKey,
  productGeminiModel,
  verifyGeminiModel,
  examGeminiModel,
  speakingGeminiModel,
  callGeminiPartnerChat,
  resolveLiveLlmKey,
  geminiApiKey,
  DailyQuotaError,
  EXAM_TIMEOUT_MS,
};
