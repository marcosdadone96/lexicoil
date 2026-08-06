'use strict';

/**
 * vocabIndexQuality.js — PASO 13 P0-3/P0-4
 *
 * Clean vocabularyTags + text lemmas → quality filter → canonicalize →
 * concept dedupe → vocabIndex entries with sources/quality/version.
 *
 * Does NOT touch generation prompts or quality gates.
 */

const { loadLemmaSet } = require('./passageVocab.js');
const { resolveFromRoot } = require('./projectRoot.js');

/** Bump when index entry shape / filter rules change. */
const VOCAB_INDEX_VERSION = 'v3-quality';

const MAX_VOCAB_INDEX = 45;

/** Functional / pronoun / generic adverb noise — never index. */
const NEVER_INDEX = new Set([
  'ihren', 'ihre', 'ihr', 'ihrem', 'ihrer', 'seinen', 'seine', 'sein', 'seinem', 'seiner',
  'anderen', 'andere', 'anderem', 'anderer', 'unseren', 'unsere', 'euren', 'eure',
  'viele', 'viel', 'meisten', 'meist', 'einfach', 'manchmal', 'oft', 'selten',
  'etwas', 'nichts', 'alles', 'jeder', 'jede', 'jedes', 'dieser', 'diese', 'dieses',
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem',
  'und', 'oder', 'aber', 'nicht', 'auch', 'mit', 'von', 'zu', 'auf', 'in', 'an', 'für',
  'bei', 'nach', 'vor', 'über', 'unter', 'durch', 'als', 'wenn', 'weil', 'dass', 'ob',
  'so', 'noch', 'nur', 'schon', 'sehr', 'mehr', 'man', 'ich', 'du', 'er', 'sie', 'es', 'wir',
  'jedem', 'jeden', 'jede', 'jeder', 'dieses', 'dieser', 'diese',
]);

/** Bare light verbs — never index alone (prefix verbs like mitmachen OK). */
const BARE_LIGHT_VERBS = new Set([
  'machen', 'gehen', 'finden', 'haben', 'sein', 'werden', 'tun', 'geben', 'nehmen',
]);

/**
 * Known typo / truncated surfaces — never enter the index.
 * (Query-side may still map some to a correct lemma for search.)
 */
const TYPO_OR_TRUNCATED = new Set([
  'vergisen', 'geword', 'nießen', 'niessen', 'gestalt',
]);

/** Query-only spelling fixes (do not index the typo form). */
const QUERY_TYPO_MAP = Object.freeze({
  vergisen: 'vergessen',
  geword: 'geworden',
  nießen: 'genießen',
  niessen: 'genießen',
});

/**
 * Concept families: members collapse to one concept key for dedupe.
 * Do NOT put false friends (Wochenende/Wochentag, Bildung/Ausbildung) together.
 */
const CONCEPT_FAMILIES = [
  {
    concept: 'anmelden',
    members: ['anmelden', 'anmeldung', 'angemeldet', 'anmeldungen'],
  },
  {
    concept: 'verzichten',
    members: ['verzichten', 'verzichtet', 'verzicht', 'verzichten_auf', 'verzicht_auf'],
  },
  {
    concept: 'recyclen',
    members: ['recyclen', 'recycling', 'recycelt', 'recycelte'],
  },
  {
    concept: 'nachhaltigkeit',
    members: ['nachhaltigkeit', 'nachhaltig', 'nachhaltige', 'nachhaltigen'],
  },
  {
    concept: 'naturschutz',
    members: ['naturschutz', 'naturschützer', 'naturschuetzer'],
  },
  {
    concept: 'gemeinschaft',
    members: ['gemeinschaft', 'gemeinschaften', 'gemeinschaftsgarten'],
  },
];

const CONCEPT_LOOKUP = (() => {
  const m = new Map();
  for (const fam of CONCEPT_FAMILIES) {
    for (const mem of fam.members) m.set(mem, fam.concept);
  }
  return m;
})();

/** Separable / prefix verbs that must keep the full form (not bare light verb). */
const KEEP_FULL_VERBS = new Set([
  'mitmachen', 'mitgehen', 'aufmachen', 'zumachen', 'anmachen', 'ausmachen',
  'teilnehmen', 'stattfinden', 'aufstehen', 'einkaufen', 'ausgehen', 'angeben',
  'ausgeben', 'zugeben', 'mitnehmen', 'aufnehmen', 'annehmen',
]);

let _Lemmatizer = null;
function getLemmatizer() {
  if (_Lemmatizer) return _Lemmatizer;
  try {
    const fs = require('fs');
    const file = resolveFromRoot('js', 'engine', 'validation', 'lemmatizer.js');
    if (fs.existsSync(file)) _Lemmatizer = require(file);
  } catch (_) { /* ignore */ }
  return _Lemmatizer;
}

function normalizeToken(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/ß/g, 'ss');
}

function tokenizePhrase(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\- ]+/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function lemmaOf(token, lang = 'de') {
  const low = String(token || '').toLowerCase();
  if (!low) return null;
  if (NEVER_INDEX.has(low)) return null;
  if (TYPO_OR_TRUNCATED.has(low)) return null;
  const Lemmatizer = getLemmatizer();
  let lem = Lemmatizer
    ? Lemmatizer.normalizeLemma(low, lang)
    : low.replace(/[^a-zäöüß\-]/gi, '');
  if (!lem) return null;
  lem = String(lem).toLowerCase();
  if (NEVER_INDEX.has(lem) || TYPO_OR_TRUNCATED.has(lem)) return null;
  return lem;
}

/**
 * Detect "verzichten auf" / "Verzicht auf" style phrases → verzichten_auf.
 */
function detectCollocationLemma(raw) {
  const t = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^verzicht(?:en)?\s+auf$/.test(t)) return 'verzichten_auf';
  if (/^bewusst(?:er|es|en)?\s+leben$/.test(t)) return 'bewusst_leben';
  return null;
}

function resolveConcept(lemma, surface) {
  const L = String(lemma || '').toLowerCase();
  if (CONCEPT_LOOKUP.has(L)) return CONCEPT_LOOKUP.get(L);
  const surf = normalizeToken(surface);
  if (CONCEPT_LOOKUP.has(surf)) return CONCEPT_LOOKUP.get(surf);

  // Anmeldung-style: -ung → verb concept when family known or stem+en
  if (L.endsWith('ung') && L.length > 5) {
    const stem = L.slice(0, -3);
    const asEn = `${stem}en`;
    if (CONCEPT_LOOKUP.has(asEn)) return CONCEPT_LOOKUP.get(asEn);
    if (CONCEPT_LOOKUP.has(stem)) return CONCEPT_LOOKUP.get(stem);
    // Only collapse clear -ung↔verb pairs we know; avoid Bildung/Ausbildung
    if (['anmeld', 'anmeld'].includes(stem) || asEn === 'anmelden') return 'anmelden';
  }
  return L;
}

/**
 * Quality gate for a single candidate token/phrase.
 * @returns {{ ok: boolean, reason?: string, lemma?: string, surface?: string, concept?: string, aliases?: string[] }}
 */
function qualityFilterToken(raw, { lang = 'de', source = 'text' } = {}) {
  const surface = String(raw || '').trim();
  if (!surface) return { ok: false, reason: 'empty' };

  const collo = detectCollocationLemma(surface);
  if (collo) {
    const concept = resolveConcept(collo, surface);
    const aliases = collo.endsWith('_auf') ? [collo.replace(/_auf$/, '')] : [];
    return {
      ok: true,
      lemma: collo,
      surface,
      concept,
      aliases,
      quality: 'validated',
    };
  }

  const low = surface.toLowerCase();
  if (TYPO_OR_TRUNCATED.has(low) || TYPO_OR_TRUNCATED.has(normalizeToken(surface))) {
    return { ok: false, reason: 'typo_or_truncated' };
  }
  if (NEVER_INDEX.has(low)) return { ok: false, reason: 'functional' };

  // Multi-word non-collocation: take content tokens only
  const parts = tokenizePhrase(surface);
  if (parts.length > 1) {
    const kept = [];
    for (const p of parts) {
      const q = qualityFilterToken(p, { lang, source });
      if (q.ok) kept.push(q);
    }
    if (!kept.length) return { ok: false, reason: 'multi_all_rejected' };
    // Prefer longest / highest-value token
    kept.sort((a, b) => String(b.lemma).length - String(a.lemma).length);
    return { ...kept[0], surface, sourcesHint: source };
  }

  // Prefix verbs: keep full form
  if (KEEP_FULL_VERBS.has(low)) {
    return {
      ok: true,
      lemma: low,
      surface,
      concept: resolveConcept(low, surface),
      aliases: [],
      quality: 'validated',
    };
  }

  const lem = lemmaOf(surface, lang);
  if (!lem) return { ok: false, reason: 'lemma_null' };

  // Bare light verb — reject unless it is a known full form already handled
  if (BARE_LIGHT_VERBS.has(lem) || BARE_LIGHT_VERBS.has(low)) {
    // mitmachen must not become machen: if surface starts with prefix, keep surface
    const prefixHit = [...KEEP_FULL_VERBS].find((v) => low === v || low.startsWith(v));
    if (prefixHit) {
      return {
        ok: true,
        lemma: prefixHit,
        surface,
        concept: resolveConcept(prefixHit, surface),
        aliases: [],
        quality: 'validated',
      };
    }
    return { ok: false, reason: 'bare_light_verb' };
  }

  if (lem.length < 3) return { ok: false, reason: 'too_short' };

  const concept = resolveConcept(lem, surface);
  const aliases = [];
  if (concept !== lem && CONCEPT_LOOKUP.has(lem)) {
    /* concept already set */
  }

  return {
    ok: true,
    lemma: lem,
    surface,
    concept,
    aliases,
    quality: source === 'vocabularyTag' ? 'validated' : 'validated',
  };
}

/**
 * Canonicalize user/search words (P0-4).
 * Maps typos for query, lemmatizes, expands verzichten_auf ↔ verzichten.
 */
function canonicalizeVocabQuery(words, { lang = 'de' } = {}) {
  const out = [];
  const seen = new Set();
  const corrections = [];

  for (const raw of words || []) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;

    const low = trimmed.toLowerCase();
    const mapped = QUERY_TYPO_MAP[low] || QUERY_TYPO_MAP[normalizeToken(trimmed)];
    let working = mapped || trimmed;
    if (mapped) corrections.push({ from: trimmed, to: mapped });

    const collo = detectCollocationLemma(working);
    if (collo) {
      for (const key of [collo, collo.replace(/_auf$/, ''), ...((CONCEPT_LOOKUP.get(collo) && [CONCEPT_LOOKUP.get(collo)]) || [])]) {
        if (key && !seen.has(key)) {
          seen.add(key);
          out.push(key);
        }
      }
      continue;
    }

    const q = qualityFilterToken(working, { lang, source: 'query' });
    // For query, allow light verbs (user may search "gehen") — still canonicalize
    let lemma = q.ok ? q.lemma : lemmaOf(working, lang) || working.toLowerCase();
    if (BARE_LIGHT_VERBS.has(String(working).toLowerCase()) && !q.ok) {
      lemma = String(working).toLowerCase();
    }
    if (TYPO_OR_TRUNCATED.has(String(working).toLowerCase()) && !mapped) {
      continue; // unknown truncated — drop from query
    }

    const concept = q.ok ? q.concept : resolveConcept(lemma, working);
    const keys = [lemma, concept, ...(q.aliases || [])].filter(Boolean);
    // verzichten_auf also matches verzichten
    if (String(lemma).endsWith('_auf')) keys.push(String(lemma).replace(/_auf$/, ''));

    for (const k of keys) {
      const kk = String(k).toLowerCase();
      if (!seen.has(kk)) {
        seen.add(kk);
        out.push(kk);
      }
    }
  }

  return { words: out, corrections, version: VOCAB_INDEX_VERSION };
}

function collectVocabularyTags(part) {
  const tags = [];
  const push = (t) => {
    if (t == null) return;
    if (typeof t === 'string') tags.push(t);
    else if (t.word) tags.push(String(t.word));
  };
  for (const q of part?.questions || []) {
    for (const t of q.vocabularyTags || []) push(t);
  }
  for (const t of part?.vocabularyTags || []) push(t);
  return tags;
}

/**
 * Build enriched vocabIndex from text + clean vocabularyTags.
 */
function buildVocabIndex(part, {
  lang = 'de',
  level = 'B1',
  max = MAX_VOCAB_INDEX,
  text = null,
} = {}) {
  const normLang = String(lang || 'de').toLowerCase();
  const levelSet = loadLemmaSet(normLang, level);
  const byConcept = new Map();

  function addCandidate(raw, source) {
    const q = qualityFilterToken(raw, { lang: normLang, source });
    if (!q.ok) return;
    const concept = q.concept || q.lemma;
    const prev = byConcept.get(concept);
    const score = (levelSet.has(q.lemma) ? 3 : 0) + (q.lemma.length >= 6 ? 2 : 1) + (source === 'vocabularyTag' ? 1 : 0);
    if (!prev || score > prev.score) {
      const sources = new Set(prev?.sources || []);
      sources.add(source);
      byConcept.set(concept, {
        word: q.surface || q.lemma,
        lemma: q.lemma,
        concept,
        aliases: q.aliases || [],
        sources: [...sources],
        quality: 'validated',
        score,
      });
    } else {
      const sources = new Set(prev.sources || []);
      sources.add(source);
      prev.sources = [...sources];
    }
  }

  const body = text != null ? text : '';
  const tokens = String(body).match(/[a-zäöüßA-ZÄÖÜß\-]+/g) || [];
  for (const tok of tokens) addCandidate(tok, 'text');

  // Collocations in text
  const lowerBody = String(body).toLowerCase();
  if (/verzicht(?:en)?\s+auf/.test(lowerBody)) addCandidate('verzichten auf', 'text');
  if (/bewusst(?:er|es|en)?\s+leben/.test(lowerBody)) addCandidate('bewusster leben', 'text');

  for (const tag of collectVocabularyTags(part)) {
    addCandidate(tag, 'vocabularyTag');
  }

  const ranked = [...byConcept.values()].sort(
    (a, b) => b.score - a.score || b.lemma.length - a.lemma.length,
  );

  return ranked.slice(0, max).map(({ score, ...rest }) => rest);
}

function vocabEntryKeys(entry) {
  const keys = new Set();
  if (entry == null) return [];
  if (typeof entry === 'string') {
    keys.add(String(entry).toLowerCase());
    return [...keys];
  }
  for (const k of [entry.lemma, entry.word, entry.concept, ...(entry.aliases || [])]) {
    if (k) keys.add(String(k).toLowerCase());
  }
  return [...keys].filter(Boolean);
}

/**
 * Rank parts for personalized vocab search (infrastructure; no ML).
 */
function rankPartsByVocab(scoredRows, {
  requestedCount = 0,
  level = null,
  module = null,
  teil = null,
} = {}) {
  return [...(scoredRows || [])]
    .map((row) => {
      const exact = Number(row.score) || 0;
      const req = requestedCount || row.coverage?.requested || 0;
      const coveragePct = req > 0 ? exact / req : 0;
      const levelOk = !level || String(row.part?.level || row.level || '').toUpperCase() === String(level).toUpperCase();
      const moduleOk = !module || String(row.part?.module || row.module || '').toLowerCase() === String(module).toLowerCase();
      const teilOk = teil == null || Number(row.part?.teil ?? row.teil) === Number(teil);
      const cefrBonus = levelOk ? 0.15 : 0;
      const moduleBonus = moduleOk ? 0.1 : 0;
      const teilBonus = teilOk ? 0.05 : 0;
      const rankScore = exact + coveragePct + cefrBonus + moduleBonus + teilBonus;
      return {
        ...row,
        exactMatches: exact,
        coveragePct,
        cefrCompatible: levelOk,
        moduleCompatible: moduleOk,
        teilCompatible: teilOk,
        rankScore,
      };
    })
    .sort((a, b) =>
      b.rankScore - a.rankScore ||
      b.exactMatches - a.exactMatches ||
      b.coveragePct - a.coveragePct,
    );
}

module.exports = {
  VOCAB_INDEX_VERSION,
  MAX_VOCAB_INDEX,
  NEVER_INDEX,
  BARE_LIGHT_VERBS,
  TYPO_OR_TRUNCATED,
  QUERY_TYPO_MAP,
  CONCEPT_FAMILIES,
  qualityFilterToken,
  canonicalizeVocabQuery,
  buildVocabIndex,
  collectVocabularyTags,
  vocabEntryKeys,
  resolveConcept,
  rankPartsByVocab,
  detectCollocationLemma,
  lemmaOf,
};
