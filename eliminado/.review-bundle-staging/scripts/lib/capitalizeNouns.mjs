/**
 * capitalizeNouns.mjs — conservative German capitalization normalizer.
 * Stable with germanCapsNormalize v3.0-stable (see GERMAN-CAPS-NORMALIZE.md).
 *
 * UP:   capitalize only after article/possessive OR at clause start when noun is certain.
 * DOWN: decapitalize mid-sentence homographs only after pronoun/modal/particle triggers.
 * Everything else is left untouched (POS gate catches remaining errors).
 */

import {
  getGermanNounLexicon,
  isKnownGermanNoun,
  NOMINALIZED_INFINITIVE_GUARD,
} from './germanNounLexicon.mjs';

export { NOMINALIZED_INFINITIVE_GUARD, isKnownGermanNoun, getGermanNounLexicon };

// ── Shared sets (also used by pool audit scripts) ───────────────────────────

export const PURE_ADVERBS = new Set([
  'eher', 'gerne', 'gern', 'leider', 'vielleicht', 'bereits', 'sogar', 'wirklich',
  'natürlich', 'eigentlich', 'trotzdem', 'allerdings', 'außerdem', 'jedoch', 'dennoch',
  'deshalb', 'deswegen', 'gleich', 'oft', 'selten', 'bald', 'sofort', 'zusammen',
  'allein', 'darum', 'dann', 'dabei', 'damit', 'dazu', 'hier', 'dort', 'oben', 'unten',
  'vorn', 'hinten', 'fast', 'kaum', 'lieber', 'statt', 'stattdessen', 'online', 'automatisch',
  'spät', 'morgens', 'abends',
]);

export const ADJ_NEEDS_ARTICLE_GUARD = new Set([
  'viele', 'viel', 'wenige', 'wenig', 'einige', 'einig',
  'gute', 'guten', 'gutes', 'gutem', 'guter', 'bessere', 'besseren', 'besseres', 'besserem', 'besserer',
  'neue', 'neuen', 'neues', 'neuem', 'neuer',
  'alte', 'alten', 'altes', 'altem',
  'kleine', 'kleinen', 'kleines', 'kleinem', 'kleiner',
  'große', 'großen', 'großes', 'großem', 'großer',
  'schöne', 'schönen', 'schönes', 'schönem', 'schöner',
  'beste', 'besten', 'bestes', 'bestem',
  'erste', 'ersten', 'erstes', 'erstem',
  'letzte', 'letzten', 'letzes', 'letztem',
  'nächste', 'nächsten', 'nächstes',
  'andere', 'anderen', 'anderes', 'anderem', 'anderer',
  'eigene', 'eigenen', 'eigenes', 'eigenem', 'eigener',
  'richtige', 'richtigen', 'richtiges', 'richtigem', 'richtiger',
  'falsche', 'falschen', 'falsches', 'falschem', 'falscher',
  'wichtige', 'wichtigen', 'wichtiges', 'wichtigem', 'wichtiger',
  'unwichtige', 'unwichtigen',
  'schlechte', 'schlechten', 'schlechtes', 'schlechtem',
  'schwierig', 'schwierige', 'schwierigen', 'schwieriges', 'schwierigem',
  'einfache', 'einfachen', 'einfaches', 'einfachem', 'einfacher',
  'möglich', 'mögliche', 'möglichen', 'mögliches', 'möglichem',
  'unmöglich', 'unmögliche', 'unmöglichen',
  'interessante', 'interessanten', 'interessantes',
  'langweilig', 'langweilige', 'langweiligen',
  'spannende', 'spannenden', 'spannendes',
  'hässliche', 'hässlichen',
  'lange', 'lang', 'kurze', 'kurz',
  'wichtig', 'persönlich', 'persönliche', 'persönlichen', 'persönliches', 'persönlichem', 'persönlicher',
  'deutlich', 'deutliche', 'deutlichen', 'deutliches', 'deutlichem', 'deutlicher',
  'nachhaltig', 'nachhaltige', 'nachhaltigen', 'nachhaltiges', 'nachhaltigem', 'nachhaltiger',
  'junge', 'jungen', 'junges', 'jungem', 'junger',
  'sicher', 'sichere', 'sicheren', 'sicheres', 'sicherem', 'sicherer',
  'nötig', 'nötige', 'nötigen', 'nötiges', 'nötigem', 'nötiger',
  'zugänglich', 'zugängliche', 'zugänglichen', 'zugängliches', 'zugänglichem', 'zugänglicher',
  'verantwortlich', 'verantwortliche', 'verantwortlichen', 'verantwortliches', 'verantwortlichem', 'verantwortlicher',
  'politisch', 'politische', 'politischen', 'politisches', 'politischem', 'politischer',
  'ganzen', 'ganzer', 'ganzes', 'ganzem', 'ganze',
  'freie', 'freien', 'freies', 'freiem', 'freier',
  'vielfältig', 'vielfältige', 'vielfältigen', 'vielfältiges', 'vielfältigem', 'vielfältiger',
  'effizient', 'effiziente', 'effizienten', 'effizientes', 'effizientem', 'effizienter',
  'öffentlich', 'öffentliche', 'öffentlichen', 'öffentliches', 'öffentlichem', 'öffentlicher',
  'schwer', 'schwere', 'schweren', 'schweres', 'schwerem', 'schwerer',
  'wichtigere', 'wichtigeres', 'wichtigerem',
  'gesellschaftlich', 'gesellschaftliche', 'gesellschaftlichen', 'gesellschaftliches', 'gesellschaftlichem', 'gesellschaftlicher',
]);

export const CARDINALS_NEEDS_ARTICLE_GUARD = new Set([
  'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig',
]);

export const NEVER_NOUN_WORDS = new Set([
  ...PURE_ADVERBS,
  ...ADJ_NEEDS_ARTICLE_GUARD,
  ...CARDINALS_NEEDS_ARTICLE_GUARD,
]);

/** Homographs that must not be capitalized mid-sentence after verb/pronoun triggers. */
export const HOMOGRAPH_RISK = new Set([
  'zahlen', 'kosten', 'arbeiten', 'erfolgen', 'verursachen', 'posten', 'spielen', 'wissen',
  'essen', 'folgen', 'stellen', 'raten', 'berichten', 'glauben', 'leben', 'lernen', 'kochen',
  'treffen', 'lesen', 'fahren', 'reisen', 'denken', 'sorgen', 'fragen',
  'spät', 'morgens', 'abends', 'ganzen', 'ganzer', 'ganzes', 'ganzem', 'ganze',
  'bessere', 'besseren', 'besseres', 'besserem', 'besserer', 'oft',
]);

export const SUBSTANTIVISING_ARTICLES = new Set([
  'der', 'die', 'das', 'dem', 'den', 'des',
  'ein', 'eine', 'einem', 'einen', 'einer', 'eines',
  'kein', 'keine', 'keinem', 'keiner', 'keines', 'keinen',
  'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines',
  'dein', 'deine', 'deinen', 'deinem', 'deiner', 'deines',
  'sein', 'seine', 'seinen', 'seinem', 'seiner', 'seines',
  'ihr', 'ihre', 'ihren', 'ihrem', 'ihrer', 'ihres',
  'unser', 'unsere', 'unseren', 'unserem', 'unserer', 'unseres',
  'euer', 'eure', 'euren', 'eurem', 'eurer', 'eures',
  'im', 'am', 'beim', 'zum', 'zur', 'vom', 'ins', 'ans',
  'dieses', 'diese', 'diesem', 'diesen', 'jenes', 'jene', 'jenem', 'jenen',
  'welches', 'welche', 'welchem', 'welchen', 'manches', 'manche', 'manchem', 'manchen',
  'als',
]);

export const DECAP_TRIGGER_PREV = new Set([
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man', 'wer',
  'zu', 'nicht', 'auch', 'nur', 'noch', 'schon', 'sehr', 'ganz', 'oft', 'immer',
  'kann', 'könnte', 'könnten', 'können',
  'muss', 'müsste', 'müssten', 'müssen',
  'soll', 'sollte', 'sollten', 'sollen',
  'will', 'wollte', 'wollten', 'wollen',
  'darf', 'dürfte', 'dürften', 'dürfen',
  'möchte', 'möchten', 'mögen', 'mag',
]);

export const MODAL_VERBS = new Set([
  'könnte', 'könnten', 'kann', 'können',
  'will', 'wollen', 'soll', 'sollen', 'muss', 'müssen',
  'darf', 'dürfen', 'möchte', 'möchten', 'mögen', 'mag',
  'werde', 'wird', 'werden',
]);

/** Prepositions that typically introduce a nominal object after modal + homograph. */
export const MODAL_NOUN_OBJECT_PREPS = new Set([
  'für', 'mit', 'an', 'auf', 'in', 'von', 'über', 'unter', 'nach', 'bei',
  'gegen', 'ohne', 'um', 'durch', 'vor', 'hinter', 'neben', 'zwischen', 'zu',
]);

export const SENTENCE_END_RE =
  /[.!?:]\s*['"„«‚\u2018\u201c\u00ab]?\s*$|[\u2013\u2014–—]\s*$|[„«‚\u2018\u201c\u00ab]\s*$|(?<!\w)['"]\s*$/;

export const MCQ_OPTION_PREFIX_RE = /^([a-jA-J]\))\s+(.*)$/s;

export const ZU_PREP_NOUN_WHITELIST = new Set([
  'hause', 'terminen', 'termine', 'termin', 'programmen', 'programme', 'programm',
  'menschen', 'kollegen', 'kollege', 'freunden', 'freunde', 'freund',
  'studenten', 'student', 'studentin', 'studentinnen', 'nachbarn', 'nachbar',
  'kindern', 'kind', 'kinder', 'eltern', 'bewohnern', 'bewohner', 'teilnehmern', 'teilnehmer',
  'veranstaltungen', 'veranstaltung', 'kursen', 'kurse', 'kurs',
  'orten', 'ort', 'orte', 'städten', 'stadt', 'städte',
  'tagen', 'tag', 'tage', 'wochen', 'woche', 'monaten', 'monat', 'monate',
  'jahren', 'jahr', 'jahre', 'stunden', 'stunde', 'schulen', 'schule',
  'bibliotheken', 'bibliothek', 'supermärkten', 'supermarkt', 'museen', 'museum',
]);

const NOMINAL_SUFFIX_RE = /(?:ung|heit|keit|schaft|tion|tät|nis|tum|chen|lein)$/i;
const ZU_INFINITIVE_RE = /\bzu\s+([A-ZÄÖÜ][a-zäöüß]*(?:en|eln|ern))\b/g;

let _safeNouns = null;

function getSafeNouns() {
  if (_safeNouns) return _safeNouns;
  _safeNouns = new Set(getGermanNounLexicon());
  return _safeNouns;
}

function capFirst(word) {
  if (!word) return word;
  return word[0].toUpperCase() + word.slice(1);
}

function tokenize(text) {
  const chunks = [];
  const RE = /([A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*)|([^A-Za-zÄÖÜäöüß]+)/g;
  let m;
  while ((m = RE.exec(text)) !== null) {
    chunks.push({ token: m[1] ?? m[2], isWord: m[1] !== undefined });
  }
  return chunks;
}

function stripTokenPunct(w) {
  return String(w || '').replace(/^[^A-Za-zÄÖÜäöüß]+|[^A-Za-zÄÖÜäöüß]+$/g, '');
}

function tokenLemma(w) {
  return stripTokenPunct(w).toLowerCase();
}

function isCapitalizedWord(token) {
  const fc = token[0];
  return (fc >= 'A' && fc <= 'Z') || fc === 'Ä' || fc === 'Ö' || fc === 'Ü';
}

function isMcqOptionBodyStart(prevContent) {
  return /(?:^|\s)[a-d]\)\s*$/i.test(prevContent);
}

function isMidSentenceCapital(prevContent) {
  if (!prevContent.length) return false;
  if (isMcqOptionBodyStart(prevContent)) return false;
  return !SENTENCE_END_RE.test(prevContent);
}

function isClauseStart(prevContent) {
  return !prevContent.length || SENTENCE_END_RE.test(prevContent);
}

function nextWordFrom(chunks, idx) {
  for (let j = idx + 1; j < chunks.length; j++) {
    if (chunks[j].isWord) return chunks[j].token;
  }
  return '';
}

function isInfinitiveShape(lc) {
  return lc.length >= 4 && /(?:en|eln|ern)$/i.test(lc);
}

function hasNominalSuffix(lc) {
  return NOMINAL_SUFFIX_RE.test(lc);
}

function isCertainNounLemma(lc) {
  return getSafeNouns().has(lc) || isKnownGermanNoun(lc) || hasNominalSuffix(lc);
}

function nextWordIsCapitalizedNoun(nextWord) {
  if (!nextWord || !isCapitalizedWord(nextWord)) return false;
  const lc = tokenLemma(nextWord);
  return isCertainNounLemma(lc) && !HOMOGRAPH_RISK.has(lc);
}

function shouldCapitalizeLowerNoun(token, prevWord, nextWord, atClauseStart) {
  const lc = tokenLemma(token);
  if (!lc || isCapitalizedWord(token)) return false;
  if (HOMOGRAPH_RISK.has(lc) && !hasNominalSuffix(lc)) return false;
  if (tokenLemma(prevWord) === 'zu' && isInfinitiveShape(lc)) return false;
  if (MODAL_VERBS.has(tokenLemma(prevWord)) && isInfinitiveShape(lc)) return false;

  const prevLc = tokenLemma(prevWord);
  // Phase 1: mirror decap ADJ_NEEDS_ARTICLE_GUARD — do not re-capitalize adj after article
  if (SUBSTANTIVISING_ARTICLES.has(prevLc) && ADJ_NEEDS_ARTICLE_GUARD.has(lc)) {
    return false;
  }

  if (!isCertainNounLemma(lc)) return false;

  if (SUBSTANTIVISING_ARTICLES.has(prevLc)) {
    if (nextWordIsCapitalizedNoun(nextWord)) return false;
    return true;
  }
  if (atClauseStart) return true;
  return false;
}

function capitalizeHyphenatedNoun(token, prevWord, nextWord, atClauseStart) {
  if (!token.includes('-')) return null;
  const parts = token.split('-');
  let changed = false;
  const capped = parts.map((part, i) => {
    if (!part || isCapitalizedWord(part)) return part;
    const pseudoPrev = i === 0 ? prevWord : parts[i - 1];
    const pseudoNext = i === parts.length - 1 ? nextWord : parts[i + 1];
    if (shouldCapitalizeLowerNoun(part, pseudoPrev, pseudoNext, atClauseStart)) {
      changed = true;
      return capFirst(part);
    }
    return part;
  });
  return changed ? capped.join('-') : null;
}

export function capitalizeNounsInText(text) {
  if (typeof text !== 'string' || !text) return { result: text, count: 0 };
  const chunks = tokenize(text);
  let count = 0;
  let prevContent = '';
  let lastWord = '';
  const parts = chunks.map(({ token, isWord }, idx) => {
    if (!isWord) {
      prevContent += token;
      return token;
    }
    const nextWord = nextWordFrom(chunks, idx);
    const atStart = isClauseStart(prevContent);
    if (isCapitalizedWord(token)) {
      prevContent += token;
      lastWord = token;
      return token;
    }
    const hyphenFixed = capitalizeHyphenatedNoun(token, lastWord, nextWord, atStart);
    if (hyphenFixed) {
      count++;
      prevContent += hyphenFixed;
      lastWord = hyphenFixed;
      return hyphenFixed;
    }
    if (shouldCapitalizeLowerNoun(token, lastWord, nextWord, atStart)) {
      const capped = capFirst(token);
      count++;
      prevContent += capped;
      lastWord = capped;
      return capped;
    }
    prevContent += token;
    lastWord = token;
    return token;
  });
  return { result: parts.join(''), count };
}

function shouldDecapitalizeMidSentenceToken(token, lastWord) {
  if (token === 'Sie') return null;
  const lc = tokenLemma(token);
  if (!isCapitalizedWord(token) || !HOMOGRAPH_RISK.has(lc)) return null;
  if (isKnownGermanNoun(token) || getSafeNouns().has(lc)) return null;
  const prevLc = tokenLemma(lastWord);
  if (!DECAP_TRIGGER_PREV.has(prevLc)) return null;
  if (SUBSTANTIVISING_ARTICLES.has(prevLc)) return null;
  return lc;
}

export function isZuInfinitiveOvercapitalized(word) {
  const lc = String(word || '').toLowerCase();
  if (!/(?:en|eln|ern)$/i.test(lc)) return false;
  if (ZU_PREP_NOUN_WHITELIST.has(lc)) return false;
  if (lc.endsWith('men')) return false;
  if (lc.endsWith('ten') && lc.length > 5) return false;
  return true;
}

export function fixZuInfinitiveCapitals(text) {
  if (typeof text !== 'string' || !text) return { result: text, count: 0 };
  let count = 0;
  const result = text.replace(ZU_INFINITIVE_RE, (full, word) => {
    if (!isZuInfinitiveOvercapitalized(word)) return full;
    count++;
    return `zu ${word.toLowerCase()}`;
  });
  return { result, count };
}

export function fixModalInfinitiveCapitals(text) {
  if (typeof text !== 'string' || !text) return { result: text, count: 0 };
  let count = 0;
  const modalAlt = [...MODAL_VERBS].join('|');
  const inf = '([A-ZÄÖÜ][a-zäöüß]*(?:en|eln|ern))';
  const reInfModal = new RegExp(`\\b${inf}\\s+(?:${modalAlt})\\b`, 'g');
  const reModalInf = new RegExp(`\\b(?:${modalAlt})\\s+${inf}\\b`, 'g');
  let result = text.replace(reInfModal, (full, word) => {
    const lc = tokenLemma(word);
    if (!HOMOGRAPH_RISK.has(lc)) return full;
    if (isKnownGermanNoun(word) || getSafeNouns().has(lc)) return full;
    count++;
    return full.replace(word, word.toLowerCase());
  });
  result = result.replace(reModalInf, (full, word) => {
    const lc = tokenLemma(word);
    if (!HOMOGRAPH_RISK.has(lc)) return full;
    if (isKnownGermanNoun(word) || getSafeNouns().has(lc)) return full;
    count++;
    return full.replace(word, word.toLowerCase());
  });
  return { result, count };
}

export function decapitalizeMidSentence(text) {
  if (typeof text !== 'string' || !text) return { result: text, count: 0 };
  const chunks = tokenize(text);
  let count = 0;
  let prevContent = '';
  let lastWord = '';
  const parts = chunks.map(({ token, isWord }, idx) => {
    if (!isWord) {
      prevContent += token;
      return token;
    }
    if (isCapitalizedWord(token) && isMidSentenceCapital(prevContent)) {
      const nextWord = nextWordFrom(chunks, idx);
      let fix = null;
      if (SUBSTANTIVISING_ARTICLES.has(tokenLemma(lastWord)) && ADJ_NEEDS_ARTICLE_GUARD.has(tokenLemma(token))) {
        fix = token.toLowerCase();
      } else if (isModalInfinitiveOvercapitalized(token, lastWord, nextWord)) {
        fix = token.toLowerCase();
      } else if (isHeuristicAdjAdvOvercapitalized(token, lastWord)) {
        fix = token.toLowerCase();
      } else {
        fix = shouldDecapitalizeMidSentenceToken(token, lastWord);
      }
      if (fix) {
        count++;
        prevContent += fix;
        lastWord = fix;
        return fix;
      }
    }
    prevContent += token;
    lastWord = token;
    return token;
  });
  let result = parts.join('');
  const zu = fixZuInfinitiveCapitals(result);
  const modal = fixModalInfinitiveCapitals(zu.result);
  return { result: modal.result, count: count + zu.count + modal.count };
}

export function isMcqOptionLine(text) {
  return MCQ_OPTION_PREFIX_RE.test(String(text || ''));
}

export function splitMcqOptionLine(text) {
  const m = String(text || '').match(MCQ_OPTION_PREFIX_RE);
  if (!m) return null;
  return { prefix: m[1], body: m[2] };
}

function pushBlockViolation(out, type, word, fix) {
  out.push({ type, word, fix, severity: 'block' });
}

function pushAdvisoryViolation(out, word) {
  out.push({ type: 'unknown_capital', word, fix: null, severity: 'advisory' });
}

export function isModalInfinitiveOvercapitalized(word, prevWord = '', nextWord = '') {
  const lc = tokenLemma(word);
  if (!HOMOGRAPH_RISK.has(lc) || !isInfinitiveShape(lc)) return false;
  const prevLc = tokenLemma(prevWord);
  const nextLc = tokenLemma(nextWord);
  if (prevLc === 'zu' || SUBSTANTIVISING_ARTICLES.has(prevLc)) return false;
  if (isKnownGermanNoun(word) && MODAL_NOUN_OBJECT_PREPS.has(nextLc)) return false;
  return MODAL_VERBS.has(nextLc) || MODAL_VERBS.has(prevLc);
}

export function isHeuristicAdjAdvOvercapitalized(word, prevWord = '') {
  const lc = tokenLemma(word);
  if (!PURE_ADVERBS.has(lc) && !ADJ_NEEDS_ARTICLE_GUARD.has(lc)) return false;
  if (SUBSTANTIVISING_ARTICLES.has(tokenLemma(prevWord))) return false;
  return true;
}

export function scanP2CapitalizationViolations(text) {
  if (typeof text !== 'string' || !text) return [];
  const violations = [];
  const chunks = tokenize(text);
  let prevContent = '';
  let lastWord = '';
  for (let idx = 0; idx < chunks.length; idx++) {
    const { token, isWord } = chunks[idx];
    if (!isWord) {
      prevContent += token;
      continue;
    }
    if (isCapitalizedWord(token) && isMidSentenceCapital(prevContent)) {
      const nextWord = nextWordFrom(chunks, idx);
      if (isModalInfinitiveOvercapitalized(token, lastWord, nextWord)) {
        pushBlockViolation(violations, 'modal_infinitive', token, token.toLowerCase());
      } else if (isHeuristicAdjAdvOvercapitalized(token, lastWord)) {
        pushBlockViolation(violations, 'adj_adv', token, token.toLowerCase());
      } else if (HOMOGRAPH_RISK.has(tokenLemma(token)) && DECAP_TRIGGER_PREV.has(tokenLemma(lastWord))) {
        pushBlockViolation(violations, 'homograph', token, token.toLowerCase());
      } else if (!isKnownGermanNoun(token) && !SUBSTANTIVISING_ARTICLES.has(tokenLemma(lastWord))) {
        pushAdvisoryViolation(violations, token);
      }
    }
    prevContent += token;
    lastWord = token;
  }
  ZU_INFINITIVE_RE.lastIndex = 0;
  let zm;
  while ((zm = ZU_INFINITIVE_RE.exec(text)) !== null) {
    const word = zm[1];
    if (isZuInfinitiveOvercapitalized(word)) {
      pushBlockViolation(violations, 'zu_infinitive', word, word.toLowerCase());
    }
  }
  return violations;
}

export function scanP2BlockingViolations(text) {
  return scanP2CapitalizationViolations(text).filter((v) => v.severity === 'block');
}

export function scanP2AdvisoryViolations(text) {
  return scanP2CapitalizationViolations(text).filter((v) => v.severity === 'advisory');
}

export function scanMcqOptionCapitalizationViolations(text) {
  return scanP2BlockingViolations(text);
}

function fixPassageTextFields(p, fixText) {
  const out = { ...p };
  if (out.text != null) out.text = fixText(out.text);
  if (out.title != null) out.title = fixText(out.title);
  if (out.transcript != null) out.transcript = fixText(out.transcript);
  if (Array.isArray(out.ads)) out.ads = out.ads.map((a) => fixText(a));
  if (Array.isArray(out.audio)) {
    out.audio = out.audio.map((turn) =>
      turn && typeof turn === 'object' && turn.text != null ? { ...turn, text: fixText(turn.text) } : turn,
    );
  }
  return out;
}

function fixQuestionTextFields(q, fixText) {
  const out = { ...q };
  if (out.question != null) out.question = fixText(out.question);
  if (out.signText != null) out.signText = fixText(out.signText);
  if (out.explanation != null) out.explanation = fixText(out.explanation);
  if (out.statement != null) out.statement = fixText(out.statement);
  if (Array.isArray(out.matchLabels)) out.matchLabels = out.matchLabels.map((l) => fixText(l));
  if (Array.isArray(out.options)) {
    out.options = out.options.map((o) => {
      if (typeof o === 'string') return fixText(o);
      if (o && typeof o === 'object' && o.text != null) return { ...o, text: fixText(o.text) };
      return o;
    });
  }
  return out;
}

export function decapitalizeBatchMidSentence(batch) {
  if (!batch || typeof batch !== 'object') return { batch, totalFixed: 0 };
  let totalFixed = 0;
  const fixText = (s) => {
    if (typeof s !== 'string') return s;
    const { result, count } = decapitalizeMidSentence(s);
    totalFixed += count;
    return result;
  };
  const passages = (batch.passages || []).map((p) => fixPassageTextFields(p, fixText));
  const questions = (batch.questions || []).map((q) => fixQuestionTextFields(q, fixText));
  return { batch: { ...batch, passages, questions }, totalFixed };
}

export function capitalizeBatchNouns(batch) {
  if (!batch || typeof batch !== 'object') return { batch, totalFixed: 0 };
  let totalFixed = 0;
  const fixText = (s) => {
    if (typeof s !== 'string') return s;
    const { result, count } = capitalizeNounsInText(s);
    totalFixed += count;
    return result;
  };
  const passages = (batch.passages || []).map((p) => fixPassageTextFields(p, fixText));
  const questions = (batch.questions || []).map((q) => fixQuestionTextFields(q, fixText));
  return { batch: { ...batch, passages, questions }, totalFixed };
}

/** Full normalize pass used in diagnostics: decap then cap. */
export function normalizeGermanCapsInText(text) {
  const d = decapitalizeMidSentence(text);
  const c = capitalizeNounsInText(d.result);
  return { result: c.result, decapCount: d.count, capCount: c.count };
}
