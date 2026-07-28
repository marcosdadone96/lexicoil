'use strict';

/**
 * Personal pool — user vocabulary matches verified against full part text (not vocabKeys row index).
 */
const { partText } = require('./partIndex.js');
const {
  buildVocabIndex,
  vocabEntryKeys,
  canonicalizeVocabQuery,
} = require('./vocabIndexQuality.js');
const { findLemmaPair } = require('./vocabPhrasesUtils.js');

function textIndexKeysFromPart(part, lang = 'de', level = 'B1') {
  const text = partText(part);
  if (!text) return { keys: new Set(), text: '' };
  const index = buildVocabIndex(part, { lang, level, text });
  const keys = new Set();
  for (const entry of index) {
    for (const k of vocabEntryKeys(entry)) keys.add(String(k).toLowerCase());
  }
  return { keys, text };
}

/**
 * @param {object} part
 * @param {string[]} userWords — surface forms from user selection
 * @param {{ lang?: string, level?: string }} [opts]
 * @returns {{ count: number, words: string[], lemmas: string[] }}
 */
function scorePersonalPartTextMatches(part, userWords, opts = {}) {
  const lang = String(opts.lang || 'de').toLowerCase();
  const level = String(opts.level || 'B1').toUpperCase();
  const { keys, text } = textIndexKeysFromPart(part, lang, level);
  const matched = [];
  const lemmas = [];
  for (const w of userWords || []) {
    const surface = String(w).trim();
    if (!surface) continue;
    const { words: qkeys } = canonicalizeVocabQuery([surface], { lang });
    let hit = qkeys.some((k) => keys.has(String(k).toLowerCase()));
    if (!hit && text) hit = !!findLemmaPair(text, surface);
    if (hit) {
      matched.push(surface);
      const primary = qkeys[0] || surface.toLowerCase();
      lemmas.push(primary);
    }
  }
  return {
    count: matched.length,
    words: matched,
    lemmas: [...new Set(lemmas.map((l) => String(l).toLowerCase()))],
  };
}

/**
 * Union text matches across multiple parts (distinct user surfaces).
 */
function unionTextMatchesFromParts(parts, userWords, opts = {}) {
  const matchedSet = new Set();
  const byPart = [];
  for (const part of parts || []) {
    if (!part) continue;
    const row = scorePersonalPartTextMatches(part, userWords, opts);
    byPart.push(row);
    for (const w of row.words) matchedSet.add(String(w).toLowerCase());
  }
  return {
    count: matchedSet.size,
    words: [...matchedSet],
    byPart,
  };
}

module.exports = {
  scorePersonalPartTextMatches,
  unionTextMatchesFromParts,
  textIndexKeysFromPart,
};
