/**
 * Filters for pool→lexicon gender batch — skip proper names and plural surfaces.
 */
import { normLemma } from './dwdsGenderLookup.mjs';

const DE_NOUN_SUFFIX =
  /(ung|heit|keit|schaft|tion|tät|ität|ismus|ment|chen|lein|tum|nis|sal|mal|ion)$/i;

/** Pool person names / surnames seen in calibration — never lexicon entries. */
const POOL_PROPER_NAMES = new Set([
  'hannah', 'jonas', 'niklas', 'maria', 'lukas', 'schmidt', 'sarah', 'philipp', 'thomas',
  'braun', 'direkt', 'katja', 'laura', 'felix', 'moritz', 'julia', 'max', 'anna', 'paul',
  'leon', 'emma', 'tim', 'lisa', 'sophie', 'david', 'michael', 'andreas', 'stefan', 'petra',
  'sandra', 'martin', 'christian', 'daniel', 'markus', 'jens', 'frank', 'klaus', 'heike',
  'monika', 'sabine', 'claudia', 'renate', 'helga', 'günter', 'hans', 'peter', 'jürgen',
]);

/** Known plural-only pool tags (DWDS singular differs). */
const POOL_PLURAL_ONLY = new Set([
  'vorteile', 'parks', 'podcasts', 'details', 'erwachsene', 'vorkenntnisse', 'projekte',
  'punkte', 'kosten', 'eltern', 'leute', 'ferien', 'geschwister', 'informationen',
  'schätzungen', 'nachbarn', 'geräten', 'schülern', 'schülerinnen',
  'nachteile', 'ratschläge', 'spaziergänge', 'fahrgäste', 'unterkünfte', 'einkünfte',
  'ereignisse', 'fahrzeuge', 'familienmomente',
]);

/**
 * @returns {{ skip: boolean, reason?: string }}
 */
export function shouldSkipLemma(lemma, goetheIndex, pluralCheck) {
  const low = normLemma(lemma);
  const raw = String(lemma || '').trim();

  if (POOL_PROPER_NAMES.has(low)) {
    return { skip: true, reason: 'proper-name-blocklist' };
  }

  if (POOL_PLURAL_ONLY.has(low)) {
    return { skip: true, reason: 'plural-surface-blocklist' };
  }

  if (/(?:ischen|lichen|ischem|ische|ischer|isches)$/i.test(low)) {
    return { skip: true, reason: 'adjective-inflection' };
  }

  if (/(?:eile|äge|ünfte|äste|eute|momente|gnisse|kurse|züge|besuche|beete|wichtigste)$/i.test(low) && !goetheIndex?.has(low)) {
    return { skip: true, reason: 'plural-surface-pattern' };
  }

  if (/(?:ene|erene|ste)$/i.test(low) && low.length > 8 && !goetheIndex?.has(low)) {
    return { skip: true, reason: 'adjective-superlative' };
  }

  // HTML-only path: short capitalized token without noun morphology → likely Vorname
  if (goetheIndex && !goetheIndex.has(low)) {
    if (/^[A-ZÄÖÜ][a-zäöüß]{2,7}$/.test(raw) && !DE_NOUN_SUFFIX.test(low)) {
      if (!/(tag|ung|keit|heit|schaft|tion|tum|ment|chen|lein|nis|sal|mal|ismus)$/i.test(low)) {
        return { skip: true, reason: 'proper-name-heuristic' };
      }
    }
  }

  // Plural morphology (runtime pluralGenderDe when available)
  if (pluralCheck?.(low) === 'p' && goetheIndex && !goetheIndex.has(low)) {
    return { skip: true, reason: 'plural-morphology' };
  }

  if (!goetheIndex?.has(low)) {
    if (low.endsWith('s') && low.length > 5 && !/(nis|us|tum|ment|chen|lein|haus|zeug|sal)$/i.test(low)) {
      return { skip: true, reason: 'plural-s' };
    }
    if (low.endsWith('e') && /(?:te|ne|se|re|le|ge|ke|de|be|fe|pe|me|ce)$/i.test(low) && low.length > 6) {
      if (!DE_NOUN_SUFFIX.test(low) && !/(ung|heit|keit|schaft|tion|tät|ität|ine|e)$/i.test(low.slice(-4))) {
        const femSingE = /(?:ung|heit|keit|schaft|tion|tät|ität|ine|ur|ei|ie)$/i.test(low);
        if (!femSingE && /(?:te|ne|se|re|le)$/i.test(low)) {
          return { skip: true, reason: 'plural-e' };
        }
      }
    }
  }

  return { skip: false };
}

export { POOL_PROPER_NAMES, POOL_PLURAL_ONLY, DE_NOUN_SUFFIX };
