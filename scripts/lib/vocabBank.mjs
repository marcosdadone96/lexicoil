/**
 * vocabBank.mjs — closed B1 (or level) lemma whitelist for prompt target words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const _cache = new Map();

/** Lowercase + trim; keep umlauts (äöüß) so prompt words stay natural. */
export function foldLemma(word) {
  return String(word || '')
    .trim()
    .toLowerCase();
}

/**
 * Load unique lemmas from library/vocab/{lang}/{level}.json
 * @returns {Set<string>} lowercased lemmas
 */
export function loadVocabBankLemmaSet(lang = 'de', level = 'B1') {
  const key = `${lang}|${level}`;
  if (_cache.has(key)) return _cache.get(key);

  const file = path.join(ROOT, 'library', 'vocab', lang, `${level}.json`);
  if (!fs.existsSync(file)) {
    const empty = new Set();
    _cache.set(key, empty);
    return empty;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const raw = Array.isArray(data) ? data : data.lemmas || data.words || [];
  const set = new Set(raw.map((w) => foldLemma(w)).filter(Boolean));
  _cache.set(key, set);
  return set;
}

/** Clear cache (tests / after bank rewrite). */
export function resetVocabBankCache() {
  _cache.clear();
}

/**
 * @param {string} word
 * @param {string} [lang]
 * @param {string} [level]
 */
export function isVocabBankLemma(word, lang = 'de', level = 'B1') {
  const w = foldLemma(word);
  if (!w) return false;
  return loadVocabBankLemmaSet(lang, level).has(w);
}
