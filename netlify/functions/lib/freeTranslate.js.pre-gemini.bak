'use strict';

/**
 * Free translation provider (best-effort).
 * Default: MyMemory — no API key, daily character limits, variable quality.
 * Swap provider by changing freeTranslate() without touching vocab-cache.
 */
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const MIN_MATCH = 0.6;
const FETCH_TIMEOUT_MS = 8000;

async function freeTranslate(text, from, to) {
  const src = String(text || '').trim();
  if (!src || !from || !to || from === to) return null;
  const q = encodeURIComponent(src.slice(0, 4000));
  const pair = `${from}|${to}`;
  const url = `${MYMEMORY_URL}?q=${q}&langpair=${pair}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    const match = data?.responseData?.match;
    if (typeof match === 'number' && match < MIN_MATCH) return null;
    const translation = String(data?.responseData?.translatedText || '').trim();
    if (!translation) return null;
    if (/INVALID LANGUAGE PAIR/i.test(translation)) return null;
    return translation;
  } catch (_) {
    return null;
  }
}

module.exports = { freeTranslate, MIN_MATCH };
