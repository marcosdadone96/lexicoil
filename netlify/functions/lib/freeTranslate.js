'use strict';

/**
 * Vocabulary translation via Gemini Flash (context-aware, cached in vocab-cache).
 *
 * Provider swap point: change this module only — vocab-cache.js stays unchanged.
 *
 * Scaling (free tier → paid billing): raise env vars only, no code edits:
 *   GEMINI_RPM          — requests/minute (default 10; free tier ≈8–15)
 *   GEMINI_RPD          — requests/day PT (default 250; free tier ≈250)
 *   GEMINI_MODEL        — e.g. gemini-2.5-flash (default)
 *   GEMINI_TRANSLATE_TIMEOUT_MS — per-request timeout (default 12000)
 *
 * Old MyMemory cache entries (source:'dict') remain until refreshed — see
 *   scripts/refresh-vocab-dict-translations.mjs
 */
const { acquire, DailyQuotaError, isDailyQuotaMessage } = require('./geminiRateLimit.js');

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const FETCH_TIMEOUT_MS = Number(process.env.GEMINI_TRANSLATE_TIMEOUT_MS) || 6000;
const FALLBACK_TIMEOUT_MS = 2500;
const MAX_429_RETRIES = 1;
const MAX_503_RETRIES = 2;

function fetchTimeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

const fs = require('fs');
const path = require('path');

const LANG_NAMES = Object.freeze({
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  pt: 'Portuguese',
});

function geminiModel() {
  return (readEnv('GEMINI_MODEL') || DEFAULT_MODEL).trim();
}

function langName(code) {
  return LANG_NAMES[String(code || '').toLowerCase()] || String(code || '');
}

function buildPrompt(text, from, to, context) {
  const src = langName(from);
  const tgt = langName(to);
  const word = String(text || '').trim();
  const ctx = String(context || '').trim().slice(0, 500);

  const head = ctx
    ? `Translate the word or short expression "${word}" (${src}) into ${tgt} as it is used in this sentence:\n"${ctx}"`
    : `Translate the word or short expression "${word}" from ${src} to ${tgt}.`;

  return `${head}

Rules:
- Give the most natural, common translation for a language student.
- If there are several meanings, pick the main one for the context (1–3 words, not a sentence).
- For German nouns, include the correct article (der/die/das) when it helps disambiguate.
- Reply with ONLY the translation, no quotes or explanation.`;
}

function cleanTranslation(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^["'`]+|["'`]+$/g, '');
  t = t.replace(/^(translation|traducción|übersetzung|traduction):\s*/i, '');
  if (t.includes('\n')) t = t.split('\n').map((l) => l.trim()).find(Boolean) || t;
  return t.slice(0, 200).trim();
}

function parseRetryMs(message) {
  const m = String(message || '').match(/retry in ([\d.]+)s/i);
  if (m) return Math.min(Math.ceil(parseFloat(m[1]) * 1000) + 500, 120000);
  return 2500;
}

function generationConfigFor(modelId) {
  const cfg = { temperature: 0.15, maxOutputTokens: 128 };
  const id = String(modelId || '');
  if (id.includes('2.5-flash') && !id.includes('lite')) {
    cfg.thinkingConfig = { thinkingBudget: 0 };
  }
  return cfg;
}

function readEnv(name) {
  return process.env[name];
}

let dotEnvCache;
function readDotEnv(name) {
  if (dotEnvCache === undefined) {
    dotEnvCache = {};
    const candidates = [
      path.join(process.cwd(), '.env'),
      path.join(__dirname, '..', '..', '..', '.env'),
    ];
    try {
      const envPath = candidates.find((p) => fs.existsSync(p));
      if (envPath) {
        for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
          const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
          if (!m) continue;
          let v = m[2].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          dotEnvCache[m[1]] = v;
        }
      }
    } catch (_) {
      dotEnvCache = {};
    }
  }
  return dotEnvCache[name] || '';
}

function normalizeApiKey(raw) {
  let key = String(raw || '').trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

function looksLikeApiKey(key) {
  const k = String(key || '');
  if (k.length < 20) return false;
  if (/^No value/i.test(k) || /environment variable/i.test(k)) return false;
  return true;
}

function geminiApiKey() {
  const local = normalizeApiKey(readDotEnv('GEMINI_API_KEY') || readDotEnv('GOOGLE_API_KEY'));
  if (looksLikeApiKey(local)) return local;
  return normalizeApiKey(readEnv('GEMINI_API_KEY') || readEnv('GOOGLE_API_KEY'));
}

async function callGeminiOnce(prompt) {
  const key = geminiApiKey();
  if (!key) return null;

  await acquire();

  const modelId = geminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: generationConfigFor(modelId),
    }),
    signal: fetchTimeoutSignal(FETCH_TIMEOUT_MS),
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
  const cleaned = cleanTranslation(text);
  if (!cleaned) {
    console.error('[freeTranslate] empty candidate', modelId, data?.candidates?.[0]?.finishReason || 'no-reason');
  }
  return cleaned || null;
}

async function tryDictFallback(text, from, to) {
  if (String(process.env.VOCAB_DICT_FALLBACK || '1') === '0') return null;
  return myMemoryFallback(text, from, to);
}

async function myMemoryFallback(text, from, to) {
  const pair = `${from}|${to}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`;
  try {
    const res = await fetch(url, { signal: fetchTimeoutSignal(FALLBACK_TIMEOUT_MS) });
    const data = await res.json().catch(() => ({}));
    const raw = data?.responseData?.translatedText || '';
    if (/MYMEMORY WARNING|QUOTA/i.test(raw)) return null;
    const cleaned = cleanTranslation(raw);
    if (!cleaned || cleaned.toLowerCase() === String(text).toLowerCase()) return null;
    return cleaned;
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} text - word or short expression
 * @param {string} from - ISO 639-1 source lang
 * @param {string} to - ISO 639-1 target lang
 * @param {string} [context] - example sentence for disambiguation
 * @returns {Promise<string|null>}
 */
async function freeTranslate(text, from, to, context) {
  const src = String(text || '').trim();
  if (!src || !from || !to || from === to) return { translation: null, reason: 'empty', source: null };

  const geminiFirst = process.env.VOCAB_GEMINI_FIRST === '1';
  if (!geminiFirst) {
    const quick = await tryDictFallback(src, from, to);
    if (quick) return { translation: quick, reason: null, source: 'dict' };
  }

  if (!geminiApiKey()) {
    const fb = await tryDictFallback(src, from, to);
    if (fb) return { translation: fb, reason: null, source: 'dict' };
    return { translation: null, reason: 'no_api_key', source: null };
  }

  const prompt = buildPrompt(src, from, to, context);
  let retries503 = 0;
  let geminiReason = 'translate_failed';

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    try {
      const translation = await callGeminiOnce(prompt);
      if (translation) return { translation, reason: null, source: 'gemini' };
      geminiReason = 'empty_response';
      break;
    } catch (err) {
      if (err.code === 'invalid_api_key') {
        geminiReason = 'invalid_api_key';
        break;
      }
      if (err instanceof DailyQuotaError || err.daily) {
        geminiReason = 'quota';
        break;
      }
      if (err.status === 503 && retries503 < MAX_503_RETRIES) {
        retries503 += 1;
        await new Promise((r) => setTimeout(r, 800 * retries503));
        attempt -= 1;
        continue;
      }
      if (err.status === 429 && attempt < MAX_429_RETRIES) {
        await new Promise((r) => setTimeout(r, parseRetryMs(err.message)));
        continue;
      }
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        geminiReason = 'timeout';
        break;
      }
      console.error('[freeTranslate]', err?.status || err?.name, err?.message || err);
      geminiReason = 'translate_failed';
      break;
    }
  }

  const fb = await tryDictFallback(src, from, to);
  if (fb) return { translation: fb, reason: null, source: 'dict' };

  return { translation: null, reason: geminiReason, source: null };
}

module.exports = { freeTranslate, buildPrompt, cleanTranslation, geminiApiKey, tryDictFallback };
