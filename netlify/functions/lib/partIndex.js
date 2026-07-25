'use strict';

/**
 * partIndex — minimal extensible pool index (topicTag + vocabIndex).
 *
 * vocabIndex entries: { word } today; optional lemma, pos, translations later.
 * Matching uses literal word (case-insensitive) unless entry.lemma is set.
 */

const path = require('path');
const { resolveFromRoot } = require('./projectRoot.js');
const { detectTopic } = require(resolveFromRoot('js', 'engine', 'partTopicDetect.js'));
const { normalizeB1Topic } = require(resolveFromRoot('js', 'data', 'b1Topics.js'));
const { loadLemmaSet, lemmatizeWords } = require('./passageVocab.js');

const MAX_VOCAB_INDEX = 30;

const STOP = new Set([
  'sein', 'haben', 'werden', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem',
  'und', 'oder', 'aber', 'nicht', 'auch', 'sie', 'er', 'es', 'wir', 'ihr', 'ich', 'du', 'man', 'mit', 'von',
  'zu', 'auf', 'in', 'an', 'für', 'bei', 'nach', 'vor', 'über', 'unter', 'durch', 'als', 'wenn', 'weil', 'dass',
  'ob', 'so', 'noch', 'nur', 'schon', 'sehr', 'mehr', 'kann', 'können', 'muss', 'müssen', 'soll', 'sollen',
  'will', 'wollen', 'wird', 'wurde', 'worden', 'hat', 'hatte', 'sind', 'war', 'waren', 'wurden',
]);

function getLemmatizer() {
  try {
    const fs = require('fs');
    const file = resolveFromRoot('js', 'engine', 'validation', 'lemmatizer.js');
    if (fs.existsSync(file)) return require(file);
  } catch (_) { /* ignore */ }
  return null;
}

function lemmaOf(token, lang) {
  const low = String(token || '').toLowerCase();
  if (!low || STOP.has(low)) return null;
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

/**
 * Reúne todo el texto legible de una parte reusable.
 */
function partText(part) {
  const chunks = [];
  const p = part?.passage;
  if (p) {
    if (p.text) chunks.push(String(p.text));
    if (p.title) chunks.push(String(p.title));
    if (Array.isArray(p.passages)) {
      for (const pp of p.passages) {
        if (pp?.text) chunks.push(String(pp.text));
        if (pp?.textTitle) chunks.push(String(pp.textTitle));
      }
    }
  }
  if (Array.isArray(part?.segments)) {
    for (const seg of part.segments) {
      if (seg?.transcript) chunks.push(String(seg.transcript));
      if (seg?.text) chunks.push(String(seg.text));
    }
  }
  if (Array.isArray(part?.ads)) {
    for (const ad of part.ads) {
      if (ad?.text) chunks.push(String(ad.text));
      if (ad?.title) chunks.push(String(ad.title));
    }
  }
  if (Array.isArray(part?.questions)) {
    for (const q of part.questions) {
      if (q?.signText) chunks.push(String(q.signText));
      if (q?.question) chunks.push(String(q.question));
      if (Array.isArray(q.options)) {
        for (const o of q.options) {
          if (typeof o === 'string') chunks.push(o);
          else if (o?.text) chunks.push(String(o.text));
        }
      }
    }
  }
  if (part?.task) chunks.push(String(part.task));
  if (part?.instruction) chunks.push(String(part.instruction));
  return chunks.join('\n').trim();
}

function computeTopicSlug(part, vocabIndex) {
  const title = String(part?.passage?.title || '').trim().toLowerCase();
  if (title) {
    return title
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }
  const fallback = (vocabIndex || [])
    .slice(0, 2)
    .map((e) => vocabEntryKey(e))
    .filter(Boolean)
    .join('-');
  return (fallback || 'sin-tema').slice(0, 48);
}

/**
 * Extract content words as extensible objects [{ word }].
 * Preserves surface form from text; filters stopwords via lemma pipeline.
 */
function extractVocabIndex(text, lang, level, max = MAX_VOCAB_INDEX) {
  if (!text) return [];
  const levelSet = loadLemmaSet(lang, level);
  const tokens = String(text).match(/[a-zäöüßA-ZÄÖÜß\-]+/g) || [];
  const scored = new Map();

  for (const tok of tokens) {
    const lemma = lemmaOf(tok, lang);
    if (!lemma) continue;
    const s = scoreLemma(lemma, levelSet);
    if (s < 0) continue;
    const low = tok.toLowerCase();
    const prev = scored.get(low);
    if (!prev || s > prev.score) {
      scored.set(low, { word: tok, score: s });
    }
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score || b.word.length - a.word.length)
    .slice(0, max)
    .map(({ word }) => ({ word }));
}

/**
 * Resolve B1 topicTag: explicit > existing > keyword detectTopic.
 * Returns null if unclassified (report as unknown in stats).
 */
function resolveTopicTag(part, explicitTopic = null) {
  const fromExplicit = normalizeB1Topic(explicitTopic);
  if (fromExplicit) return fromExplicit;

  const fromPart = normalizeB1Topic(part?.topicTag);
  if (fromPart) return fromPart;

  const text = partText(part);
  const detected = detectTopic(text);
  return normalizeB1Topic(detected);
}

/** Match key for pool search — prefers lemma when present (future LemmaService). */
function vocabEntryKey(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string') return String(entry).toLowerCase();
  if (entry.lemma) return String(entry.lemma).toLowerCase();
  if (entry.word) return String(entry.word).toLowerCase();
  return '';
}

function getPartVocabIndex(part) {
  if (Array.isArray(part?.vocabIndex) && part.vocabIndex.length) {
    return part.vocabIndex;
  }
  if (Array.isArray(part?.vocab) && part.vocab.length) {
    return part.vocab.map((v) => (typeof v === 'string' ? { word: v } : v));
  }
  return [];
}

function normalizeSearchWords(words, lang) {
  const raw = (words || []).map((w) => String(w).trim()).filter(Boolean);
  if (!raw.length) return [];
  try {
    return lemmatizeWords(raw, lang);
  } catch (_) {
    return raw.map((w) => w.toLowerCase());
  }
}

/**
 * Literal-first match: compares normalized word keys (case-insensitive).
 * When entry.lemma exists, it is preferred over entry.word.
 */
function scorePartWordCoverage(part, words, { lang = 'de', literal = true } = {}) {
  const want = literal
    ? new Set((words || []).map((w) => String(w).toLowerCase()))
    : new Set(normalizeSearchWords(words, lang));
  const vocabIndex = getPartVocabIndex(part);
  const covered = [];
  for (const entry of vocabIndex) {
    const key = vocabEntryKey(entry);
    if (key && want.has(key)) covered.push(entry.word || entry.lemma || key);
  }
  return {
    score: covered.length,
    coveredWords: covered,
    coverage: { covered: covered.length, requested: want.size },
  };
}

/**
 * Apply topicTag + topicSlug + vocabIndex to a part payload (mutates copy).
 */
function applyPartIndex(part, { lang, level, topicTag = null, force = false } = {}) {
  if (!part || typeof part !== 'object') return part;
  const out = part;
  const normLang = String(lang || part.lang || 'de').toLowerCase();
  const normLevel = String(level || part.level || 'B1').toUpperCase();

  if (force || !Array.isArray(out.vocabIndex) || !out.vocabIndex.length) {
    const text = partText(out);
    out.vocabIndex = extractVocabIndex(text, normLang, normLevel, MAX_VOCAB_INDEX);
  }

  if (force || !out.topicTag) {
    out.topicTag = resolveTopicTag(out, topicTag || out.topicTag);
  }

  if (force || !out.topicSlug) {
    out.topicSlug = computeTopicSlug(out, out.vocabIndex);
  }

  // Legacy alias for diversity filter (excludeTopics) — same slug, not B1 topicTag.
  out.topic = out.topicSlug;

  if (out.schemaVersion == null || out.schemaVersion < 2) {
    out.schemaVersion = 2;
  }

  return out;
}

/**
 * buscar — pool search for hybrid reparto (no side effects).
 *
 * @param {object[]} parts  Full part records (seed or loaded payloads)
 * @param {object} opts
 * @returns {object[]} sorted by coverage desc
 */
function buscar(parts, {
  lang = 'de',
  level = 'B1',
  module,
  teil = null,
  topicTag = null,
  words = [],
  literal = true,
} = {}) {
  const normLang = String(lang).toLowerCase();
  const normLevel = String(level).toUpperCase();
  const normModule = String(module || '').toLowerCase();
  const wantTopic = normalizeB1Topic(topicTag);

  const results = [];
  for (const part of parts || []) {
    if (String(part.lang || '').toLowerCase() !== normLang) continue;
    if (String(part.level || '').toUpperCase() !== normLevel) continue;
    if (String(part.module || '').toLowerCase() !== normModule) continue;
    if (teil != null && Number(part.teil) !== Number(teil)) continue;
    if (part.disabled === true) continue;
    if (part.complete !== true || part.verified !== true) continue;

    if (wantTopic) {
      const partTopic = normalizeB1Topic(part.topicTag);
      if (partTopic !== wantTopic) continue;
    }

    const { score, coveredWords, coverage } = scorePartWordCoverage(part, words, { lang: normLang, literal });
    // Vocab ranks candidates; topicTag match is enough to serve (score may be 0).

    results.push({
      id: part.id,
      module: part.module,
      teil: part.teil,
      topicTag: part.topicTag || null,
      score,
      coveredWords,
      coverage,
      part,
    });
  }

  results.sort((a, b) =>
    b.score - a.score ||
    (b.part?.vocabIndex?.length || 0) - (a.part?.vocabIndex?.length || 0) ||
    (a.part?.servedCount || 0) - (b.part?.servedCount || 0),
  );

  return results;
}

module.exports = {
  MAX_VOCAB_INDEX,
  partText,
  extractVocabIndex,
  resolveTopicTag,
  computeTopicSlug,
  applyPartIndex,
  vocabEntryKey,
  getPartVocabIndex,
  scorePartWordCoverage,
  buscar,
};
