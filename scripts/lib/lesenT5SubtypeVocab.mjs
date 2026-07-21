/**
 * lesenT5SubtypeVocab.mjs — Adapt target words to T5 structural subtype (not just topic tag).
 */
import { LESEN_T5_SUBTYPES } from './lesenSubtypeRotation.mjs';
import { foldLemma } from './vocabBank.mjs';

/** Words that clash with facility/pool rules (shopping/retail) when subtype is not kantine. */
const RETAIL_LEMMAS = new Set(
  ['marke', 'supermarkt', 'rabatt', 'angebot', 'produkt', 'einkauf', 'laden', 'bestellung', 'preis'].map(
    foldLemma,
  ),
);

/** Subtype-safe B1 words for normative T5 texts (forms flexionadas OK en generación). */
export const T5_SUBTYPE_VOCAB_POOL = Object.freeze({
  freizeitzentrum: [
    'anmeldung',
    'gebühr',
    'regel',
    'raum',
    'parkplatz',
    'schwimmbad',
    'kurs',
    'termin',
    'öffnungszeit',
    'besucher',
  ],
  bibliothek: ['ausleihe', 'leihfrist', 'gebühr', 'medien', 'ruhe', 'regel', 'öffnungszeit', 'anmeldung'],
  schule: ['unterricht', 'klassenraum', 'regel', 'anmeldung', 'termin', 'schüler', 'ordnung', 'sauberkeit'],
  sportverein: ['mitglied', 'training', 'halle', 'kurs', 'anmeldung', 'gebühr', 'regel', 'schließfach'],
  kantine: ['mensa', 'mittagessen', 'gebühr', 'regel', 'bestellung', 'gast', 'hygiene', 'tablett'],
  park: ['hund', 'grillen', 'spielplatz', 'öffnungszeit', 'müll', 'regel', 'fahrrad', 'besucher'],
  markthalle: ['stand', 'markt', 'gebühr', 'regel', 'probe', 'pfand', 'verkäufer', 'hygiene', 'anmeldung'],
  einkaufszentrum: ['center', 'parkhaus', 'regel', 'öffnungszeit', 'besucher', 'geschäft', 'gebühr', 'kinderwagen', 'rauchen'],
});

/** Minimum integrated user/target words for Lesen T5 when vocab was requested. */
export const MIN_T5_VOCAB_INTEGRATED = 2;

/** Konsum×T5: retail lemmas clash with Regeltext — gate relaxed (0 required). */
export const MIN_KONSUM_T5_VOCAB_INTEGRATED = 0;

function subtypeDef(textSubtype) {
  return LESEN_T5_SUBTYPES.find((s) => s.id === textSubtype) || null;
}

function wordMatchesSubtype(word, textSubtype) {
  const def = subtypeDef(textSubtype);
  if (!def?.keywords) return false;
  return def.keywords.test(String(word));
}

/**
 * Re-map topic target words to subtype-appropriate vocabulary for T5 prompts.
 * Keeps words that fit the subtype; swaps retail-only Konsum words when subtype ≠ kantine.
 *
 * @param {string[]} words
 * @param {string|null} topicTag
 * @param {string|null} textSubtype
 * @returns {{ words: string[], swapped: string[], kept: string[] }}
 */
export function adaptT5WordsForSubtype(words, topicTag, textSubtype) {
  const input = (words || []).map(String).filter(Boolean);
  if (!textSubtype || input.length === 0) {
    return { words: input, swapped: [], kept: input };
  }

  const pool = T5_SUBTYPE_VOCAB_POOL[textSubtype] || [];
  const used = new Set(input.map((w) => foldLemma(w)));
  const kept = [];
  const swapped = [];
  const out = [];

  for (const w of input) {
    const f = foldLemma(w);
    const retailOnWrongSubtype =
      textSubtype !== 'kantine' && RETAIL_LEMMAS.has(f) && !wordMatchesSubtype(w, textSubtype);
    if (!retailOnWrongSubtype) {
      out.push(w);
      kept.push(w);
      continue;
    }
    const replacement = pool.find((p) => !used.has(foldLemma(p)));
    if (replacement) {
      out.push(replacement);
      swapped.push(`${w}→${replacement}`);
      used.add(foldLemma(replacement));
    } else {
      kept.push(w);
      out.push(w);
    }
  }

  // Fill up to original count with subtype pool words if we swapped too many out
  let i = 0;
  while (out.length < input.length && pool.length) {
    const pick = pool[i % pool.length];
    i += 1;
    if (used.has(foldLemma(pick))) continue;
    out.push(pick);
    swapped.push(`+${pick}`);
    used.add(foldLemma(pick));
  }

  return { words: out.slice(0, input.length), swapped, kept };
}

/**
 * Konsum×T5: never use coverage retail words — pick rule-vocab from subtype pool only.
 * @param {string} textSubtype
 * @param {number} [count=6]
 */
export function resolveKonsumT5PromptWords(textSubtype, count = 6) {
  const pool = T5_SUBTYPE_VOCAB_POOL[textSubtype] || T5_SUBTYPE_VOCAB_POOL.markthalle;
  const n = Math.min(Math.max(1, count), pool.length);
  return pool.slice(0, n);
}

/**
 * Quality gate: T5 should integrate at least MIN_T5_VOCAB_INTEGRATED prompted words.
 * Konsum×T5 uses MIN_KONSUM_T5_VOCAB_INTEGRATED (0) — omitting retail words is correct.
 * @param {object} batch
 * @returns {{ ok: boolean, count: number, minHits: number, message?: string }}
 */
export function checkT5VocabIntegration(batch) {
  const fb = batch?.userVocabFeedback;
  const requested = fb?.requested || fb?.prompted || [];
  const used = fb?.used || [];
  const topic = String(batch?.topicTag || batch?._requestedTopic || fb?.topic || '').trim();
  const isKonsum = topic === 'Konsum';
  const minRequired = isKonsum ? MIN_KONSUM_T5_VOCAB_INTEGRATED : MIN_T5_VOCAB_INTEGRATED;
  const minHits = Math.min(minRequired, requested.length);
  if (!requested.length || minHits < 1) return { ok: true, count: used.length, minHits: 0 };
  const ok = used.length >= minHits;
  return {
    ok,
    count: used.length,
    minHits,
    requested: requested.length,
    message: ok
      ? null
      : `Teil 5: vocabulario integrado ${used.length}/${requested.length} (mínimo ${minHits}) — ` +
        `palabras no usadas: ${(fb.notUsed || requested).slice(0, 6).join(', ')}`,
  };
}
