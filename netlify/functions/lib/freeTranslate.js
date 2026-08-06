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

/**
 * Reject MyMemory spam / ads (e.g. anbieten→en returns a Trustpilot marketing URL)
 * and other non-gloss payloads that must never be shown as a learner translation.
 */
function isJunkTranslation(raw) {
  const t = String(raw || '').trim();
  if (!t) return true;
  if (/MYMEMORY WARNING|QUOTA EXCEEDED|YOU USED ALL/i.test(t)) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (/\bhttps?:\/\//i.test(t)) return true;
  if (/\b[\w.-]+\.(com|net|org|io|info)\b/i.test(t) && /\/|www\./i.test(t)) return true;
  if (/<[^>]+>/.test(t)) return true;
  return false;
}

function cleanTranslation(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^["'`]+|["'`]+$/g, '');
  t = t.replace(/^(translation|traducción|übersetzung|traduction):\s*/i, '');
  if (t.includes('\n')) t = t.split('\n').map((l) => l.trim()).find(Boolean) || t;
  t = t.slice(0, 200).trim();
  if (isJunkTranslation(t)) return '';
  return t;
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

  // Default: Gemini first. MyMemory is last-resort only — its top matches are often
  // spam URLs (reproduced: anbieten|de→en → fivestar-marketing Trustpilot link).
  // Opt into legacy MyMemory-first with VOCAB_MYMEMORY_FIRST=1.
  const myMemoryFirst = process.env.VOCAB_MYMEMORY_FIRST === '1';
  if (myMemoryFirst) {
    const quick = await tryDictFallback(src, from, to);
    if (quick && !isJunkTranslation(quick)) return { translation: quick, reason: null, source: 'dict' };
  }

  if (!geminiApiKey()) {
    const fb = await tryDictFallback(src, from, to);
    if (fb && !isJunkTranslation(fb)) return { translation: fb, reason: null, source: 'dict' };
    return { translation: null, reason: 'no_api_key', source: null };
  }

  const prompt = buildPrompt(src, from, to, context);
  let retries503 = 0;
  let geminiReason = 'translate_failed';

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    try {
      const translation = await callGeminiOnce(prompt);
      if (translation && !isJunkTranslation(translation)) {
        return { translation, reason: null, source: 'gemini' };
      }
      if (translation && isJunkTranslation(translation)) geminiReason = 'junk_response';
      else geminiReason = 'empty_response';
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
  if (fb && !isJunkTranslation(fb)) return { translation: fb, reason: null, source: 'dict' };

  return { translation: null, reason: geminiReason, source: null };
}

function buildLemmaPrompt(surface, context) {
  const word = String(surface || '').trim();
  const ctx = String(context || '').trim().slice(0, 500);
  return `German vocabulary helper for language learners.

Sentence: "${ctx}"
Clicked word form: "${word}"

Return the FULL dictionary infinitive for the clicked word in this sentence.

German word order — separable verbs (trennbare Verben):
- In a MAIN clause the finite verb is typically in 2nd position and the separable particle is typically at the END of that clause ("bietet … an" → anbieten; "schlägt … vor" → vorschlagen; "schlägt … nach" → nachschlagen; "ruft … an" → anrufen).
- In a SUBORDINATE clause (after weil / dass / wenn / obwohl / als / …) the separable verb is NOT split: the full infinitive-like form stands at the END of the clause ("…, weil ich dich morgen anrufe" → anrufen). Do NOT invent a missing particle and do NOT look for a separated particle outside that subordinate clause.
- Do NOT return only the bare stem (schlagen, bieten, rufen) when a particle is present in the SAME main clause.

Rules:
- Reply with ONLY one lowercase German infinitive (or noun/adj lemma if not a verb).
- No quotes, no explanation, no URL, no punctuation.`;
}

function cleanLemma(raw) {
  let t = String(raw || '').trim();
  if (isJunkTranslation(t)) return '';
  t = t.replace(/^["'`]+|["'`]+$/g, '');
  t = t.replace(/^(lemma|infinitive|wort|verb):\s*/i, '');
  if (t.includes('\n')) t = t.split('\n').map((l) => l.trim()).find(Boolean) || t;
  t = t.split(/\s+/)[0] || '';
  if (isJunkTranslation(t)) return '';
  t = t.replace(/[^a-zäöüß\-]/gi, '').toLowerCase();
  if (!t || t.length < 2 || t.length > 40) return '';
  if (isJunkTranslation(t)) return '';
  return t;
}

/**
 * Resolve dictionary lemma for a surface in sentence context (separable-verb safety net).
 * @returns {Promise<{lemma:string|null, reason:string|null, source:string|null}>}
 */
async function resolveSeparableLemma(surface, context) {
  const word = String(surface || '').trim();
  const ctx = String(context || '').trim();
  if (!word || ctx.length < 8) return { lemma: null, reason: 'empty', source: null };
  if (!geminiApiKey()) return { lemma: null, reason: 'no_api_key', source: null };

  const prompt = buildLemmaPrompt(word, ctx);
  try {
    const raw = await callGeminiOnce(prompt);
    let lemma = cleanLemma(raw);
    if (!lemma) return { lemma: null, reason: raw ? 'junk_response' : 'empty_response', source: null };

    // If model returned a bare stem, try reuniting a clause-final particle from context
    lemma = maybeReuniteParticle(lemma, word, ctx) || lemma;

    if (isJunkTranslation(lemma)) return { lemma: null, reason: 'junk_response', source: null };
    return { lemma, reason: null, source: 'gemini' };
  } catch (err) {
    if (err.code === 'invalid_api_key') return { lemma: null, reason: 'invalid_api_key', source: null };
    if (err instanceof DailyQuotaError || err.daily) return { lemma: null, reason: 'quota', source: null };
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { lemma: null, reason: 'timeout', source: null };
    }
    console.error('[resolveSeparableLemma]', err?.status || err?.name, err?.message || err);
    return { lemma: null, reason: 'lemma_failed', source: null };
  }
}

/** Heuristic: «schlägt … nach» + lemma "schlagen" → nachschlagen */
function maybeReuniteParticle(lemma, surface, context) {
  const lem = String(lemma || '').toLowerCase();
  const lowCtx = String(context || '').toLowerCase();
  if (!lem || !/(?:en|eln|ern)$/.test(lem)) return null;
  // Already looks reunified
  if (
    /^(mit|auf|an|aus|ein|vor|nach|bei|ab|zu|weg|los|zurück|weiter|fest|teil|statt|um|über|unter|durch|zusammen)/.test(lem)
    && lem.length > 8
  ) {
    return null;
  }
  const particles = [
    'zurück', 'zusammen', 'weiter', 'heran', 'herum', 'statt', 'durch', 'über', 'unter',
    'mit', 'auf', 'an', 'aus', 'ein', 'vor', 'nach', 'bei', 'ab', 'zu', 'weg', 'los', 'fest', 'teil', 'um', 'hin', 'her',
  ];
  const surf = String(surface || '').toLowerCase();
  const idx = lowCtx.indexOf(surf);
  const after = idx >= 0 ? lowCtx.slice(idx + surf.length) : lowCtx;
  for (const p of particles) {
    const re = new RegExp(`(?:^|\\s)${p}(?=\\s|[.,;:!?]|$)`);
    if (!re.test(after)) continue;
    const full = `${p}${lem}`;
    if (full.length >= 6 && /(?:en|eln|ern)$/.test(full)) return full;
  }
  return null;
}

function buildGenderPrompt(word, opts) {
  const noun = String(word || '').trim();
  const likelyPlural = !!(opts && opts.likelyPlural);
  if (likelyPlural) {
    return `German vocabulary helper for language learners.

Word form: "${noun}"

This may be a plural noun form (not the dictionary singular lemma).
- If it is a plural noun in standard contemporary German (Standarddeutsch), the definite article is always "die".
- If it is actually a singular noun, reply with only: der, die, or das.
- If it is not a German noun, reply: none

Reply with ONLY one line in one of these formats:
- "die plural" (plural noun)
- "der" / "die" / "das" (singular noun)
- "none"`;
  }
  return `German vocabulary helper for language learners.

Noun: "${noun}"

What is the correct definite article (der, die, or das) for this German noun in standard contemporary German (Standarddeutsch)?

Rules:
- Reply with ONLY one word: der, die, or das.
- No quotes, no explanation, no m/f/n notation.`;
}

function cleanArticle(raw) {
  const parsed = cleanGenderResponse(raw);
  return parsed?.article || null;
}

/** @returns {{ article: string|null, plural: boolean }} */
function cleanGenderResponse(raw) {
  let t = String(raw || '').trim().toLowerCase();
  if (isJunkTranslation(t)) return { article: null, plural: false };
  t = t.replace(/^["'`]+|["'`]+$/g, '');
  if (t.includes('\n')) t = t.split('\n').map((l) => l.trim()).find(Boolean) || t;
  if (/\bdie\s+plural\b/.test(t) || t === 'plural' || t === 'die (plural)') {
    return { article: 'die', plural: true };
  }
  const m = t.match(/\b(der|die|das)\b/);
  if (m) return { article: m[1], plural: false };
  return { article: null, plural: false };
}

/**
 * Resolve der/die/das for a German noun (AI safety net when lexicon misses).
 * @param {string} word
 * @param {{ likelyPlural?: boolean }} [opts]
 * @returns {Promise<{article:string|null, plural:boolean, reason:string|null, source:string|null}>}
 */
async function resolveGermanGender(word, opts) {
  const noun = String(word || '').trim();
  const likelyPlural = !!(opts && opts.likelyPlural);
  if (!noun || noun.length < 2) return { article: null, plural: false, reason: 'empty', source: null };
  if (!geminiApiKey()) return { article: null, plural: false, reason: 'no_api_key', source: null };

  const prompt = buildGenderPrompt(noun, { likelyPlural });
  try {
    const raw = await callGeminiOnce(prompt);
    const parsed = cleanGenderResponse(raw);
    if (!parsed.article) return { article: null, plural: false, reason: raw ? 'junk_response' : 'empty_response', source: null };
    return { article: parsed.article, plural: parsed.plural, reason: null, source: 'gemini' };
  } catch (err) {
    if (err.code === 'invalid_api_key') return { article: null, plural: false, reason: 'invalid_api_key', source: null };
    if (err instanceof DailyQuotaError || err.daily) return { article: null, plural: false, reason: 'quota', source: null };
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { article: null, plural: false, reason: 'timeout', source: null };
    }
    console.error('[resolveGermanGender]', err?.status || err?.name, err?.message || err);
    return { article: null, plural: false, reason: 'gender_failed', source: null };
  }
}

module.exports = {
  freeTranslate,
  resolveSeparableLemma,
  resolveGermanGender,
  maybeReuniteParticle,
  buildPrompt,
  buildLemmaPrompt,
  buildGenderPrompt,
  cleanTranslation,
  cleanLemma,
  cleanArticle,
  cleanGenderResponse,
  isJunkTranslation,
  geminiApiKey,
  tryDictFallback,
};
