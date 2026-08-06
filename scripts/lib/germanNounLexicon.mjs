/**
 * germanNounLexicon.mjs
 *
 * Orthography gate lexicon: «is this a German noun?» (any level), NOT «is it B1?».
 * Sources: de-gender.json, CEFR vocab (A1–B2), content/vocabulary noun entries,
 * compound decomposition, plural / -in variants.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LEXICON_PATH = path.join(ROOT, 'data/lexicon/de-gender.json');
const NOUN_SUPPLEMENT_PATH = path.join(__dirname, 'data', 'german-noun-supplement.json');
const VOCAB_DIR = path.join(ROOT, 'library/vocab/de');
const CONTENT_VOCAB_GLOB = path.join(ROOT, 'content/vocabulary/de');

/** Typical noun suffixes — orthography, not CEFR level. */
export const NOUN_SUFFIX_RE = /(?:ung|heit|keit|schaft|tum|nis|ismus|ist|chen|lein|tion|sion|ät|ik|zeug|werk|wert|zeit|ort|platz|raum|feld|tag|jahr|monat|woche|stunde|mittel|gerät|dienst|form|plan|recht|schaft)$/i;

const NON_NOUN_WORDS = new Set([
  'ich', 'sie', 'er', 'es', 'wir', 'ihr', 'sich', 'dich', 'mich',
  'die', 'eine', 'einer', 'ein', 'dieser', 'diese', 'dieses',
  'jeder', 'jede', 'jedes', 'andere', 'anderer', 'anderes',
  'welche', 'welcher', 'welches', 'kein', 'keine', 'keiner',
  'alle', 'alles', 'mein', 'dein', 'sein',
  'oder', 'aber', 'und', 'denn', 'weil', 'dass', 'wenn', 'bevor', 'obwohl',
  'während', 'sobald', 'damit',
  'von', 'zum', 'zur', 'bei', 'vor', 'über', 'unter', 'zwischen', 'hinter',
  'ohne', 'wie', 'durch', 'gegen', 'nach', 'seit', 'ab', 'aus', 'mit',
  'an', 'auf', 'in', 'für', 'um',
  'hier', 'heute', 'später', 'früher', 'immer', 'nie', 'schon', 'nur',
  'weniger', 'wenig', 'mehr', 'vorne', 'wieder', 'weiter', 'auch', 'sehr',
  'dann', 'jetzt', 'dort', 'noch',
  'nein', 'ja', 'bitte',
  'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'wurde', 'wurden', 'hat', 'haben', 'hatte', 'bin', 'bist', 'war',
]);

/** Written cardinals — orthography: lowercase mid-sentence unless substantivised. */
export const CARDINAL_WORDS = new Set([
  'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn',
  'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig',
]);

/** Adverbs with no common nominal form — excluded from noun lexicon. */
export const LEXICON_EXCLUDED_ADVERBS = new Set([
  'eher', 'gerne', 'gern', 'leider', 'vielleicht', 'bereits', 'sogar', 'wirklich',
  'natürlich', 'eigentlich', 'trotzdem', 'allerdings', 'außerdem', 'jedoch',
  'dennoch', 'deshalb', 'deswegen', 'gleich', 'oft', 'selten', 'bald', 'sofort',
  'zusammen', 'allein', 'darum', 'dabei', 'dazu', 'oben', 'unten', 'vorn', 'hinten',
  'fast', 'kaum', 'lieber', 'statt', 'stattdessen',
  // Temporal -s adverbs (montags, abends) — otherwise singularCandidates strips -s → Montag/Abend
  'abends', 'morgens', 'mittags', 'nachmittags', 'vormittags', 'nachts',
  'montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags', 'sonntags',
]);

/** Infinitives often nominalised — keep in lexicon even with -en shape. */
export const NOMINALIZED_INFINITIVE_GUARD = new Set([
  'essen', 'trinken', 'leben', 'lernen', 'lesen', 'schreiben', 'sprechen', 'fahren',
  'kommen', 'gehen', 'machen', 'arbeiten', 'kochen', 'wohnen', 'denken', 'wissen',
  'spielen', 'schlafen', 'laufen', 'stehen', 'sitzen', 'bleiben', 'finden',
  'glauben', 'glaube', 'stimmen', 'stimme', 'radfahren',
  // Verb/noun homograph — «kleine unternehmen» must capitalize; V2 «unternehmen wir» stays verb via V2 decap
  'unternehmen',
]);

const LEVELS = ['A1', 'A2', 'B1', 'B2'];
const compoundCache = new Map();

let _lexicon = null;
let _stats = null;

function isInfinitiveShape(lc) {
  return lc.length >= 4 && /(?:en|eln|ern)$/i.test(lc);
}

function looksLikeNounMorphology(lc) {
  return NOUN_SUFFIX_RE.test(lc);
}

function umlautToBase(ch) {
  return ({ ä: 'a', ö: 'o', ü: 'u', ß: 'ss' })[ch] || ch;
}

function denormalizeUmlautPlural(singular, pluralForm) {
  // garten → gärten: reverse last vowel umlaut if plural used umlaut+en
  if (!pluralForm.endsWith('en') || pluralForm.length <= singular.length) return null;
  const stem = pluralForm.slice(0, -2);
  if (stem.length < 3) return null;
  const last = stem[stem.length - 1];
  if ('äöü'.includes(last)) {
    const cand = stem.slice(0, -1) + umlautToBase(last);
    if (cand === singular || singular.startsWith(cand)) return singular;
    return cand;
  }
  return stem;
}

function singularCandidates(lemma) {
  const out = new Set([lemma]);
  if (lemma.endsWith('innen') && lemma.length > 5) out.add(lemma.slice(0, -3) + 'in');
  if (lemma.endsWith('in') && lemma.length > 4) out.add(lemma.slice(0, -2));
  if (lemma.endsWith('chen') && lemma.length > 6) out.add(lemma.slice(0, -4));
  if (lemma.endsWith('lein') && lemma.length > 6) out.add(lemma.slice(0, -4));
  if (lemma.endsWith('en') && lemma.length > 4) {
    out.add(lemma.slice(0, -2));
    out.add(lemma.slice(0, -1));
  }
  if (lemma.endsWith('n') && lemma.length > 4 && !lemma.endsWith('en')) out.add(lemma.slice(0, -1));
  if (lemma.endsWith('e') && lemma.length > 4) out.add(lemma.slice(0, -1));
  if (lemma.endsWith('s') && lemma.length > 4) out.add(lemma.slice(0, -1));
  // NOTE: do NOT strip bare -er (später→spät, niedriger→niedrig). That mapped
  // comparative/temporal adverbs onto adjective stems wrongly present in the gender
  // lexicon. Agent nouns (Lehrer, Arbeiter) are listed as full lemmas already.
  return [...out];
}

function loadGenderLexicon() {
  try {
    return JSON.parse(fs.readFileSync(LEXICON_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function loadNounSupplement() {
  try {
    return JSON.parse(fs.readFileSync(NOUN_SUPPLEMENT_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function loadCefrLemmas() {
  const lemmas = new Set();
  for (const lv of LEVELS) {
    const fp = path.join(VOCAB_DIR, `${lv}.json`);
    if (!fs.existsSync(fp)) continue;
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    for (const w of data.lemmas || []) {
      if (w && w.length >= 3) lemmas.add(String(w).toLowerCase());
    }
  }
  return lemmas;
}

function loadContentVocabNouns() {
  const nouns = new Set();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(fp);
      else if (ent.isFile() && ent.name.endsWith('.json')) {
        try {
          const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
          for (const sec of data.sections || []) {
            for (const item of sec.items || []) {
              const w = String(item.word || '').trim();
              const m = w.match(/^(?:der|die|das)\s+(.+)$/i);
              if (m) nouns.add(m[1].toLowerCase());
            }
          }
        } catch { /* optional files */ }
      }
    }
  };
  walk(CONTENT_VOCAB_GLOB);
  return nouns;
}

function isLikelyVerbInfinitive(lemma) {
  if (!isInfinitiveShape(lemma)) return false;
  if (NOMINALIZED_INFINITIVE_GUARD.has(lemma)) return false;
  if (looksLikeNounMorphology(lemma)) return false;
  if (/(?:ieren|eln|ern)$/i.test(lemma)) return true;
  // Long -en lemmas without nominal suffix are usually verbs (verursachen, besuchen…)
  if (lemma.length >= 9) return true;
  return false;
}

function shouldIncludeAsNoun(lemma, genderRaw, cefrHas) {
  if (!lemma || lemma.length < 3) return false;
  if (NON_NOUN_WORDS.has(lemma)) return false;
  if (LEXICON_EXCLUDED_ADVERBS.has(lemma)) return false;
  if (CARDINAL_WORDS.has(lemma)) return false;

  const inGender = genderRaw != null && genderRaw !== '';
  if (inGender) {
    if (isLikelyVerbInfinitive(lemma)) return false;
    return true;
  }

  if (cefrHas) {
    if (isLikelyVerbInfinitive(lemma)) return false;
    if (looksLikeNounMorphology(lemma)) return true;
  }
  return false;
}

function buildLexicon() {
  const gender = loadGenderLexicon();
  const cefr = loadCefrLemmas();
  const content = loadContentVocabNouns();
  const lexicon = new Set();

  for (const [w, g] of Object.entries(gender)) {
    const lc = w.toLowerCase();
    if (shouldIncludeAsNoun(lc, g, cefr.has(lc))) lexicon.add(lc);
  }

  for (const w of cefr) {
    if (shouldIncludeAsNoun(w, gender[w], true)) lexicon.add(w);
    if (content.has(w)) lexicon.add(w);
  }

  // CEFR lemmas in de-gender but filtered as verb infinitives: keep if nominalisable
  for (const w of cefr) {
    if (gender[w] && !lexicon.has(w) && NOMINALIZED_INFINITIVE_GUARD.has(w)) lexicon.add(w);
  }

  for (const w of content) lexicon.add(w);

  for (const w of loadNounSupplement()) {
    const lc = String(w || '').toLowerCase().trim();
    if (lc.length >= 2) lexicon.add(lc);
  }

  // Common pilot / exam stems missing from gender but clearly nominal
  for (const w of [
    'bildschirm', 'bildschirmzeit', 'brettspiel', 'brettspiele', 'spieleabend',
    'verfasser', 'verfasserin', 'autor', 'autorin', 'gemeinschaftsgarten',
    'gemeinschaftsgärten', 'nachhaltigkeit', 'spiel', 'brett', 'abend',
    'kunde', 'kunden',
  ]) {
    lexicon.add(w);
  }

  return lexicon;
}

export function getGermanNounLexicon() {
  if (!_lexicon) _lexicon = buildLexicon();
  return _lexicon;
}

export function getGermanNounLexiconStats() {
  if (!_stats) {
    const lex = getGermanNounLexicon();
    _stats = {
      size: lex.size,
      genderPath: LEXICON_PATH,
      levels: LEVELS,
    };
  }
  return _stats;
}

function lexiconHas(lemma, lexicon) {
  if (lexicon.has(lemma)) return true;
  for (const sing of singularCandidates(lemma)) {
    if (lexicon.has(sing)) return true;
    const rev = denormalizeUmlautPlural(sing, lemma);
    if (rev && lexicon.has(rev)) return true;
  }
  return false;
}

function splitCompoundLemma(lemma, lexicon, depth = 0) {
  if (depth > 4 || lemma.length < 6) return false;
  const key = `${lemma}:${depth}`;
  if (compoundCache.has(key)) return compoundCache.get(key);

  if (lexiconHas(lemma, lexicon)) {
    compoundCache.set(key, true);
    return true;
  }

  for (let i = 3; i <= lemma.length - 3; i++) {
    const left = lemma.slice(0, i);
    const right = lemma.slice(i);

    const tryPair = (l, r) => {
      if (!lexiconHas(l, lexicon)) return false;
      if (lexiconHas(r, lexicon)) return true;
      return splitCompoundLemma(r, lexicon, depth + 1);
    };

    if (tryPair(left, right)) {
      compoundCache.set(key, true);
      return true;
    }

    // Fugen-s / -es / -en / -er
    for (const strip of [1, 2]) {
      if (left.length > strip + 2) {
        const ls = left.slice(0, -strip);
        if (tryPair(ls, right)) {
          compoundCache.set(key, true);
          return true;
        }
      }
    }
  }

  for (const sing of singularCandidates(lemma)) {
    if (sing !== lemma && splitCompoundLemma(sing, lexicon, depth + 1)) {
      compoundCache.set(key, true);
      return true;
    }
  }

  compoundCache.set(key, false);
  return false;
}

/**
 * True when `word` is a known German noun (direct, inflected, or compound).
 * Orthography only — C1 nouns count; B2 vocab gate is separate.
 *
 * Non-nouns listed in NON_NOUN_WORDS / LEXICON_EXCLUDED_ADVERBS are rejected
 * before singularCandidates — otherwise «später» matched via «spät», «abends» via «abend».
 */
export function isKnownGermanNoun(word) {
  const lemma = String(word || '').toLowerCase().replace(/^[^a-zäöüß]+|[^a-zäöüß]+$/gi, '');
  if (!lemma || lemma.length < 2) return false;
  if (NON_NOUN_WORDS.has(lemma)) return false;
  if (LEXICON_EXCLUDED_ADVERBS.has(lemma)) return false;
  if (CARDINAL_WORDS.has(lemma)) return false;
  const lexicon = getGermanNounLexicon();
  if (lexiconHas(lemma, lexicon)) return true;
  return splitCompoundLemma(lemma, lexicon);
}
