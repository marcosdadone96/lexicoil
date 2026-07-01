#!/usr/bin/env node
/**
 * Tests for Gemini vocabulary translation (freeTranslate.js).
 *
 * Usage:
 *   node scripts/test-vocab-gemini-translate.mjs
 *   node scripts/test-vocab-gemini-translate.mjs --live   # requires GEMINI_API_KEY
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { freeTranslate, buildPrompt, cleanTranslation } = require(
  path.join(ROOT, 'netlify/functions/lib/freeTranslate.js'),
);

const live = process.argv.includes('--live');
process.env.VOCAB_DICT_FALLBACK = '0';
process.env.VOCAB_GEMINI_FIRST = '1';

// ── unit: prompt + cleaner ───────────────────────────────────────────────
assert.match(
  buildPrompt('Schloss', 'de', 'en', 'Das Schloss auf dem Berg ist sehr alt.'),
  /as it is used in this sentence/i,
);
assert.match(buildPrompt('Schloss', 'de', 'en'), /from German to English/i);
assert.equal(cleanTranslation('"das Schloss"\n'), 'das Schloss');
assert.equal(cleanTranslation('Translation: die Burg'), 'die Burg');

// ── unit: rate limit serializes ───────────────────────────────────────────
{
  const origFetch = globalThis.fetch;
  let concurrent = 0;
  let maxConcurrent = 0;
  globalThis.fetch = async () => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((r) => setTimeout(r, 30));
    concurrent -= 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'test' }] } }],
      }),
    };
  };
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
  await Promise.all([
    freeTranslate('Haus', 'de', 'en'),
    freeTranslate('Baum', 'de', 'en'),
    freeTranslate('Auto', 'de', 'en'),
  ]);
  globalThis.fetch = origFetch;
  assert.equal(maxConcurrent, 1, 'translations should be serialized (max concurrent 1)');
}

// ── unit: 429 degrades gracefully ─────────────────────────────────────────
{
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ error: { message: 'Rate limit exceeded. retry in 1s' } }),
    };
  };
  process.env.GEMINI_API_KEY = 'test-key';
  const out = await freeTranslate('Schloss', 'de', 'en', 'Das Schloss ist alt.');
  globalThis.fetch = origFetch;
  assert.equal(out.translation, null, '429 should return null, not throw');
  assert.ok(calls >= 2, 'should retry once after 429');
}

// ── unit: daily quota returns null ──────────────────────────────────────────
{
  const prev = process.env.GEMINI_RPD;
  process.env.GEMINI_RPD = '0';
  process.env.GEMINI_API_KEY = 'test-key';
  const out = await freeTranslate('Wort', 'de', 'en');
  process.env.GEMINI_RPD = prev;
  assert.equal(out.translation, null);
}

// ── live: disambiguation (optional) ─────────────────────────────────────────
if (live && process.env.GEMINI_API_KEY) {
  const castle = await freeTranslate('Schloss', 'de', 'en', 'Das Schloss auf dem Berg ist sehr alt.');
  const lock = await freeTranslate('Schloss', 'de', 'en', 'Der Schlüssel passt nicht ins Schloss.');
  console.log('Live Schloss (castle):', castle);
  console.log('Live Schloss (lock):', lock);
  assert.ok(castle.translation, 'castle context should return translation');
  assert.ok(lock.translation, 'lock context should return translation');
  assert.notEqual(
    castle.translation.toLowerCase(),
    lock.translation.toLowerCase(),
    'context should disambiguate Schloss meanings',
  );

  const t1 = await freeTranslate('Bank', 'de', 'en', 'Ich sitze auf der Bank im Park.');
  await new Promise((r) => setTimeout(r, 7000));
  const t2 = await freeTranslate('Bank', 'de', 'en', 'Ich gehe zur Bank und hebe Geld ab.');
  console.log('Live Bank (bench):', t1);
  console.log('Live Bank (bank):', t2);
} else if (live) {
  console.warn('Skip live tests — set GEMINI_API_KEY');
}

console.log('OK   test-vocab-gemini-translate');
