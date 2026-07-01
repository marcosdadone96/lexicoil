/**
 * capitalizeNouns.mjs
 * Deterministic German noun capitalizer using data/lexicon/de-gender.json.
 *
 * Algorithm:
 *  1. Load the gender lexicon (word → gender).  Its keys are known German words.
 *  2. Filter out entries that are NOT nouns (articles, pronouns, prepositions,
 *     conjunctions, adverbs, adjectives, verbs) using a deterministic blocklist.
 *  3. capitalizeNounsInText(text): for every token in the text, if it is all-
 *     lowercase and its lowercase form is in the SAFE_NOUNS set, capitalize its
 *     first letter.  Never touches words that already start with a capital.
 *  4. capitalizeBatchNouns(batch): applies capitalizeNounsInText to every free-
 *     text field in a passage/question batch.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEXICON_PATH = path.resolve(__dirname, '../../data/lexicon/de-gender.json');

// ── Deterministic blocklist of lexicon entries that are NOT common nouns ─────
// These are function words (articles, pronouns, prepositions, conjunctions),
// adjectives, adverbs, and infinitive verbs that ended up in the gender lexicon
// but should NEVER be capitalised in the middle of a sentence.
const NON_NOUN_WORDS = new Set([
  // Personal & reflexive pronouns
  'ich', 'sie', 'er', 'es', 'wir', 'ihr', 'sich', 'dich', 'mich',
  // Definite / indefinite articles & determiners
  'die', 'eine', 'einer', 'ein',
  'dieser', 'diese', 'dieses',
  'jeder', 'jede', 'jedes',
  'andere', 'anderer', 'anderes',
  'welche', 'welcher', 'welches',
  'kein', 'keine', 'keiner',
  'alle', 'alles',
  'mein', 'dein', 'sein',  // when used as articles/possessives rather than nouns
  // Conjunctions
  'oder', 'aber', 'und', 'denn', 'weil', 'dass', 'wenn', 'bevor', 'obwohl',
  'während', 'sobald', 'damit',
  // Prepositions
  'von', 'zum', 'zur', 'bei', 'vor', 'über', 'unter', 'zwischen', 'hinter',
  'ohne', 'wie', 'durch', 'gegen', 'nach', 'seit', 'ab', 'aus', 'mit',
  'an', 'auf', 'in', 'für', 'um',
  // Adverbs
  'hier', 'heute', 'später', 'früher', 'immer', 'nie', 'schon', 'nur',
  'weniger', 'wenig', 'mehr', 'vorne', 'wieder', 'weiter', 'auch', 'sehr',
  'dann', 'jetzt', 'dort', 'noch', 'schon',
  // Adjectives / comparatives found in lexicon
  'klein', 'jung', 'niedrig', 'teuer', 'billig', 'richtig', 'wichtig',
  'schwer', 'frei', 'fertig', 'müde', 'glücklich', 'traurig', 'hungrig',
  'interessant', 'wissenschaftlich', 'wirtschaftlich', 'ledig', 'leise',
  'letzte', 'ganz', 'rein', 'übrig', 'besser', 'billiger', 'größer',
  'kleiner', 'schlechter', 'teurer', 'positive', 'zentrale',
  'rhetorische', 'politische', 'sogenannte',
  // Infinitives / verbal nouns that are overwhelmingly used as verbs
  'machen', 'sprechen', 'suchen', 'brauchen', 'löschen', 'wünschen',
  // Interjections / particles
  'nein', 'ja', 'bitte',
  // Misc false positives
  'dein',   // possessive adjective
]);

// ── Load lexicon once ─────────────────────────────────────────────────────────
let _safeNouns = null;

function getSafeNouns() {
  if (_safeNouns) return _safeNouns;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(LEXICON_PATH, 'utf8'));
  } catch (e) {
    console.warn(`[capitalizeNouns] Could not load lexicon: ${e.message}`);
    _safeNouns = new Set();
    return _safeNouns;
  }
  _safeNouns = new Set(
    Object.keys(raw).filter((w) => !NON_NOUN_WORDS.has(w) && w.length >= 3),
  );
  return _safeNouns;
}

// ── Core capitalizer ──────────────────────────────────────────────────────────

/**
 * Capitalize the first letter of `word` while preserving the rest.
 */
function capFirst(word) {
  if (!word) return word;
  return word[0].toUpperCase() + word.slice(1);
}

/**
 * Tokenize `text` into alternating [word, non-word] chunks preserving all
 * whitespace, punctuation, and special characters.
 * Returns an array of {token, isWord} objects.
 */
function tokenize(text) {
  const chunks = [];
  // Match sequences of word chars (including German umlauts, ß) or non-word
  // chunks.  German "word chars" include a-z, ä, ö, ü, ß, A-Z, Ä, Ö, Ü.
  const RE = /([A-Za-zÄÖÜäöüß]+)|([^A-Za-zÄÖÜäöüß]+)/g;
  let m;
  while ((m = RE.exec(text)) !== null) {
    if (m[1] !== undefined) {
      chunks.push({ token: m[1], isWord: true });
    } else {
      chunks.push({ token: m[2], isWord: false });
    }
  }
  return chunks;
}

/**
 * Apply noun capitalisation to a single string.
 * Returns { result: string, count: number } where `count` is the number of
 * words capitalised.
 */
export function capitalizeNounsInText(text) {
  if (typeof text !== 'string' || !text) return { result: text, count: 0 };
  const nouns = getSafeNouns();
  const chunks = tokenize(text);
  let count = 0;
  const parts = chunks.map(({ token, isWord }) => {
    if (!isWord) return token;
    // Already starts with uppercase — leave it alone.
    if (token[0] >= 'A' && token[0] <= 'Z') return token;
    // Check if lowercase matches a known safe noun.
    const lower = token.toLowerCase();
    if (nouns.has(lower)) {
      count++;
      return capFirst(token);
    }
    return token;
  });
  return { result: parts.join(''), count };
}

/**
 * Apply capitalizeNounsInText to all free-text fields in a batch object
 * ({ passages, questions }).
 * Returns { batch: <corrected batch>, totalFixed: number }.
 */
export function capitalizeBatchNouns(batch) {
  if (!batch || typeof batch !== 'object') return { batch, totalFixed: 0 };
  let totalFixed = 0;

  const fixText = (s) => {
    if (typeof s !== 'string') return s;
    const { result, count } = capitalizeNounsInText(s);
    totalFixed += count;
    return result;
  };

  const passages = (batch.passages || []).map((p) => ({
    ...p,
    ...(p.text != null ? { text: fixText(p.text) } : {}),
    ...(p.title != null ? { title: fixText(p.title) } : {}),
  }));

  const questions = (batch.questions || []).map((q) => {
    const out = { ...q };
    if (out.question != null) out.question = fixText(out.question);
    if (out.signText != null) out.signText = fixText(out.signText);
    if (out.explanation != null) out.explanation = fixText(out.explanation);
    if (Array.isArray(out.options)) {
      out.options = out.options.map((o) => (typeof o === 'string' ? fixText(o) : o));
    }
    return out;
  });

  return { batch: { ...batch, passages, questions }, totalFixed };
}
