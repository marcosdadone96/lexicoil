'use strict';

/**
 * Passage vocabulary extraction — same lemmatization pipeline as scripts/enrich-bank-vocab-tags.mjs.
 */

const path = require('path');
const fs = require('fs');
const { resolveFromRoot } = require('./projectRoot.js');

const STOP = new Set([
  'sein', 'haben', 'werden', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem',
  'und', 'oder', 'aber', 'nicht', 'auch', 'sie', 'er', 'es', 'wir', 'ihr', 'ich', 'du', 'man', 'mit', 'von',
  'zu', 'auf', 'in', 'an', 'für', 'bei', 'nach', 'vor', 'über', 'unter', 'durch', 'als', 'wenn', 'weil', 'dass',
  'ob', 'so', 'noch', 'nur', 'schon', 'sehr', 'mehr', 'kann', 'können', 'muss', 'müssen', 'soll', 'sollen',
  'will', 'wollen', 'wird', 'wurde', 'worden', 'hat', 'hatte', 'sind', 'war', 'waren', 'wurden', 'könnte',
  'müsste', 'dieser', 'diese', 'dieses', 'jeder', 'jede', 'alle', 'viel', 'wenig', 'gut', 'neu', 'alt',
]);

let _Lemmatizer = null;

function getLemmatizer() {
  if (_Lemmatizer) return _Lemmatizer;
  const candidates = [
    resolveFromRoot('js', 'engine', 'validation', 'lemmatizer.js'),
    path.join(__dirname, '../../../js/engine/validation/lemmatizer.js'),
    path.join(__dirname, '../../js/engine/validation/lemmatizer.js'),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        _Lemmatizer = require(file);
        return _Lemmatizer;
      }
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

function loadLemmaSet(lang, level) {
  try {
    const candidates = [
      resolveFromRoot('library', 'vocab', lang, `${level}.json`),
      path.join(__dirname, '../../../library/vocab', lang, `${level}.json`),
    ];
    let file = null;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        file = candidate;
        break;
      }
    }
    if (!file) return new Set();
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Set((data.lemmas || []).map((w) => String(w).toLowerCase()));
  } catch (_) {
    return new Set();
  }
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\-]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function lemmaOf(token, lang) {
  const low = token.toLowerCase();
  if (STOP.has(low)) return null;
  const Lemmatizer = getLemmatizer();
  const lem = Lemmatizer
    ? Lemmatizer.normalizeLemma(low, lang)
    : low.replace(/[^a-zäöüß\-]/gi, '');
  if (!lem || STOP.has(lem)) return null;
  return lem;
}

function scoreLemma(lemma, levelSet) {
  if (!lemma || lemma.length < 3) return -1;
  if (STOP.has(lemma)) return -1;
  if (lemma.length < 4 && !['gehen', 'essen', 'lesen', 'hoen', 'fahren', 'stehen'].includes(lemma)) return -1;
  let score = lemma.length >= 6 ? 2 : 1;
  if (levelSet.has(lemma)) score += 3;
  return score;
}

function extractFromText(text, lang, levelSet, max) {
  const scored = new Map();
  for (const tok of tokenize(text)) {
    const lemma = lemmaOf(tok, lang);
    if (!lemma) continue;
    const s = scoreLemma(lemma, levelSet);
    if (s < 0) continue;
    const prev = scored.get(lemma) || 0;
    if (s > prev) scored.set(lemma, s);
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, max)
    .map(([w]) => w);
}

function extractPassageVocab(text, lang, level, max = 20) {
  const levelSet = loadLemmaSet(lang, level);
  return extractFromText(text, lang, levelSet, max);
}

/**
 * Lematiza palabras sueltas del usuario con el mismo pipeline que los pasajes.
 * No aplica el filtro de score (no descarta por longitud): queremos el lema base
 * de CADA palabra pedida para emparejarla contra part.vocab[].
 */
function lemmatizeWords(words, lang) {
  const out = new Set();
  for (const w of words || []) {
    for (const tok of tokenize(String(w))) {
      const lem = lemmaOf(tok, lang);
      if (lem) out.add(lem);
    }
  }
  return [...out];
}

module.exports = { extractPassageVocab, extractFromText, loadLemmaSet, lemmatizeWords };
