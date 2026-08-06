'use strict';

/**
 * partIndex — pool index (topicTag + vocabIndex).
 *
 * PASO 13 P0-3/P0-4: vocabIndex built via vocabIndexQuality
 * (text + clean vocabularyTags → filter → canonicalize → concept dedupe).
 *
 * Entry shape (v3-quality):
 *   { word, lemma, concept?, aliases?, sources: ['text'|'vocabularyTag'], quality: 'validated' }
 * Legacy { word } entries still match via vocabEntryKey.
 */

const { resolveFromRoot } = require('./projectRoot.js');
const { detectTopic } = require(resolveFromRoot('js', 'engine', 'partTopicDetect.js'));
const { normalizeB1Topic } = require(resolveFromRoot('js', 'data', 'b1Topics.js'));
const { lemmatizeWords } = require('./passageVocab.js');
const { partPassesPublishGate } = require('./partPublishGate.js');
const {
  VOCAB_INDEX_VERSION,
  MAX_VOCAB_INDEX,
  buildVocabIndex,
  canonicalizeVocabQuery,
  vocabEntryKeys,
  rankPartsByVocab,
} = require('./vocabIndexQuality.js');

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
  if (Array.isArray(part?.passages)) {
    for (const pp of part.passages) {
      if (pp?.text) chunks.push(String(pp.text));
      if (pp?.title) chunks.push(String(pp.title));
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
  if (part?.text) chunks.push(String(part.text));
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
 * Extract content words — delegates to quality pipeline (text only; tags merged in applyPartIndex).
 */
function extractVocabIndex(text, lang, level, max = MAX_VOCAB_INDEX) {
  return buildVocabIndex(
    { questions: [] },
    { lang, level, max, text: text || '' },
  );
}

function resolveTopicTag(part, explicitTopic = null) {
  const fromExplicit = normalizeB1Topic(explicitTopic);
  if (fromExplicit) return fromExplicit;

  const fromPart = normalizeB1Topic(part?.topicTag);
  if (fromPart) return fromPart;

  const text = partText(part);
  const detected = detectTopic(text);
  return normalizeB1Topic(detected);
}

/** Match key for pool search — prefers lemma when present. */
function vocabEntryKey(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string') return String(entry).toLowerCase();
  if (entry.lemma) return String(entry.lemma).toLowerCase();
  if (entry.concept) return String(entry.concept).toLowerCase();
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
    const canon = canonicalizeVocabQuery(raw, { lang });
    if (canon.words.length) return canon.words;
  } catch (_) { /* fall through */ }
  try {
    return lemmatizeWords(raw, lang);
  } catch (_) {
    return raw.map((w) => w.toLowerCase());
  }
}

/**
 * Match user words against vocabIndex (lemma / concept / aliases).
 */
function scorePartWordCoverage(part, words, { lang = 'de', literal = false } = {}) {
  const wantList = literal
    ? (words || []).map((w) => String(w).toLowerCase())
    : normalizeSearchWords(words, lang);
  const want = new Set(wantList);
  const vocabIndex = getPartVocabIndex(part);
  const covered = [];
  const coveredKeys = new Set();

  for (const entry of vocabIndex) {
    const keys = vocabEntryKeys(entry);
    for (const key of keys) {
      if (key && want.has(key) && !coveredKeys.has(key)) {
        coveredKeys.add(key);
        covered.push(entry.word || entry.lemma || key);
        break;
      }
    }
  }

  // Also count concept-level hits once
  const exactConcepts = new Set();
  for (const entry of vocabIndex) {
    const keys = vocabEntryKeys(entry);
    if (keys.some((k) => want.has(k))) {
      exactConcepts.add(entry.concept || entry.lemma || vocabEntryKey(entry));
    }
  }

  return {
    score: exactConcepts.size || covered.length,
    coveredWords: covered,
    coverage: { covered: exactConcepts.size || covered.length, requested: want.size },
  };
}

/**
 * Apply topicTag + topicSlug + enriched vocabIndex (mutates copy).
 */
function applyPartIndex(part, { lang, level, topicTag = null, force = false } = {}) {
  if (!part || typeof part !== 'object') return part;
  const out = part;
  const normLang = String(lang || part.lang || 'de').toLowerCase();
  const normLevel = String(level || part.level || 'B1').toUpperCase();

  const needsRebuild =
    force ||
    !Array.isArray(out.vocabIndex) ||
    !out.vocabIndex.length ||
    out.vocabIndexVersion !== VOCAB_INDEX_VERSION;

  if (needsRebuild) {
    const text = partText(out);
    out.vocabIndex = buildVocabIndex(out, {
      lang: normLang,
      level: normLevel,
      max: MAX_VOCAB_INDEX,
      text,
    });
    out.vocabIndexVersion = VOCAB_INDEX_VERSION;
  }

  if (force || !out.topicTag) {
    out.topicTag = resolveTopicTag(out, topicTag || out.topicTag);
  }

  if (force || !out.topicSlug) {
    out.topicSlug = computeTopicSlug(out, out.vocabIndex);
  }

  out.topic = out.topicSlug;

  if (out.schemaVersion == null || out.schemaVersion < 2) {
    out.schemaVersion = 2;
  }

  return out;
}

/**
 * buscar — pool search for hybrid reparto (no side effects).
 */
function buscar(parts, {
  lang = 'de',
  level = 'B1',
  module,
  teil = null,
  topicTag = null,
  words = [],
  literal = false,
  rank = true,
} = {}) {
  const normLang = String(lang).toLowerCase();
  const normLevel = String(level).toUpperCase();
  const normModule = String(module || '').toLowerCase();
  const wantTopic = normalizeB1Topic(topicTag);
  const canon = canonicalizeVocabQuery(words, { lang: normLang });
  const searchWords = canon.words.length ? canon.words : words;

  const results = [];
  for (const part of parts || []) {
    if (String(part.lang || '').toLowerCase() !== normLang) continue;
    if (String(part.level || '').toUpperCase() !== normLevel) continue;
    if (String(part.module || '').toLowerCase() !== normModule) continue;
    if (teil != null && Number(part.teil) !== Number(teil)) continue;
    if (!partPassesPublishGate(part)) continue;

    if (wantTopic) {
      const partTopic = normalizeB1Topic(part.topicTag);
      if (partTopic !== wantTopic) continue;
    }

    const { score, coveredWords, coverage } = scorePartWordCoverage(part, searchWords, {
      lang: normLang,
      literal,
    });

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

  if (rank) {
    return rankPartsByVocab(results, {
      requestedCount: searchWords.length,
      level: normLevel,
      module: normModule,
      teil,
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
  VOCAB_INDEX_VERSION,
  partText,
  extractVocabIndex,
  resolveTopicTag,
  computeTopicSlug,
  applyPartIndex,
  vocabEntryKey,
  vocabEntryKeys,
  getPartVocabIndex,
  scorePartWordCoverage,
  normalizeSearchWords,
  canonicalizeVocabQuery,
  buscar,
  rankPartsByVocab,
};
