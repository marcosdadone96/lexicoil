/**
 * contentTopicCheck.mjs — Q4 helper: topicTag vs contenido del passage.
 *
 * Determinista (keywords + word-boundary). No modifica partTopicDetect.js
 * scoring path de Lesen (substring). Solo se usa en metadataSchemaGate para Hören.
 *
 * Criterio de mismatch (2026-07-10):
 *   A) Alternativo gana: best !== tag && bestScore > tagScore && incompatible
 *   B) Tag sin soporte: tagScore === 0 && bestScore === 0
 *      (el tag declarado no tiene hits Y tampoco hay candidato fuerte —
 *       evita FN cuando el contenido no encaja en ningún keyword set)
 *
 * No se usa umbral «tagScore muy bajo pero >0» sin alternativo: produce FPs
 * en pasajes correctamente etiquetados con cobertura léxica escasa.
 */
import { createRequire } from 'node:module';
import { topicsAreCompatible } from './topicFamilies.mjs';

const require = createRequire(import.meta.url);
const { TOPIC_KEYWORDS } = require('../../../js/engine/partTopicDetect.js');

/** Extra lemmas frecuentes en Hören B1 que el detector shared no cubre bien. */
export const HOREN_TOPIC_EXTRAS = Object.freeze({
  Arbeit: [
    'Kollegen', 'Kollegin', 'Besprechung', 'Konferenzraum', 'Stellenanzeige',
    'Jobsuchende', 'Verkaufsteam', 'Arbeitszeiten', 'Arbeitstag',
    // «Büro» ya está en TOPIC_KEYWORDS.Arbeit — no duplicar (inflaba scores)
  ],
  Umwelt: [
    'Umweltschutz', 'Wertstoffhof', 'Batterien', 'Batterie', 'Recycling',
    'Elektromotor', 'Abgase', 'Abfall', 'Mülltrennung',
  ],
  Verkehr: [
    'Fahrgäste', 'Fahrgast', 'Stadtbus', 'Haltestelle', 'Haltestellen',
    'Buslinie', 'Gleis', 'Regionalzug',
  ],
  Bildung: [
    'Online-Kurs', 'Online-Lernen', 'Lernen', 'Lernplattform', 'E-Learning',
    'Schüler', 'Student', 'Vorlesung',
  ],
  Ernährung: ['Rezepte', 'Lebensmittel', 'vegane', 'vegan', 'saisonal', 'regional'],
  Technik: ['Handy', 'Handys', 'Smartphone', 'App', 'Computer', 'Software'],
  Freizeit: ['Freizeit', 'Hobby', 'Wochenende', 'Garten', 'Freizeitzentrum', 'Klavier', 'Basteln', 'Schnupperkurs'],
  Konsum: ['Supermarkt', 'Einkauf', 'Angebot', 'Rabatt', 'kaufen'],
  Wohnen: ['Wohnung', 'Vermieter', 'Umzug', 'Nachbar'],
  // «Miete» solo en base — idiom «halbe Miete» se filtra aparte
  Stadtleben: ['Gemeinschaftsgarten', 'Stadtteil', 'Viertel', 'Bürger'],
  Sport: [
    'Sportverein', 'Sportfreunde', 'Sportplatz', 'Sportangebot', 'Sportbegeisterte',
    'Joggen', 'Fitnessstudio', 'Hallenbad', 'Schwimmseminar', 'Yogakurs',
    'Medaille', 'Startgebühr', 'Laufveranstaltung', 'Wanderfreunde', 'Wandergruppe',
  ],
  Gesundheit: [
    'Stress', 'Belastung', 'Belastungen', 'Prävention', 'Präventionskurs',
    'achtsam', 'atmen', 'Immunsystem', 'Sprechstunde', 'Hustenmittel',
    'Gesundheits', 'gesünder', 'Rückenproblemen', 'Gelenkschmerzen',
  ],
});

/**
 * Idioms where a Wohnen/Arbeit keyword is figurative, not topical.
 * If every hit of `kw` is inside an idiom match, the keyword does not count.
 */
const KEYWORD_IDIOM_SKIP = Object.freeze([
  { kw: 'Miete', re: /\bhalbe\s+Miete\b/gi },
]);

/**
 * German noun vs verb without a lemmatizer: Konsum keyword «Laden» (shop) must
 * match capital-L only. Case-insensitive matching falsely hits verb «laden»
 * / «Wir laden Sie …». Sentence-initial imperative «Laden Sie … ein» also has
 * capital L — exclude when «Laden» is immediately followed by «Sie».
 */
const CAPITALIZED_NOUN_ONLY = Object.freeze(new Set(['laden']));

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordHit(text, kw) {
  if (CAPITALIZED_NOUN_ONLY.has(kw.toLowerCase())) {
    // Noun form only (der Laden); no /i — mid-sentence verbs are lowercase.
    const noun = `${kw[0].toUpperCase()}${kw.slice(1).toLowerCase()}`;
    const re = new RegExp(
      `(?:^|[^A-Za-zÄÖÜäöüß])(${escapeRe(noun)})(?=[^A-Za-zÄÖÜäöüß]|$)`,
      'g',
    );
    for (const m of text.matchAll(re)) {
      const afterIdx = (m.index ?? 0) + m[0].length;
      // «Laden Sie …» = imperative of (ein)laden, not the shop noun.
      if (/^\s*Sie\b/.test(text.slice(afterIdx))) continue;
      return true;
    }
    return false;
  }
  const re = new RegExp(`(?:^|[^A-Za-zÄÖÜäöüß])${escapeRe(kw)}(?:[^A-Za-zÄÖÜäöüß]|$)`, 'i');
  return re.test(text);
}

/** True if kw appears in text only inside known non-topical idioms. */
function keywordOnlyInIdiom(text, kw) {
  const rules = KEYWORD_IDIOM_SKIP.filter((r) => r.kw.toLowerCase() === kw.toLowerCase());
  if (!rules.length) return false;
  const hitRe = new RegExp(`(?:^|[^A-Za-zÄÖÜäöüß])${escapeRe(kw)}(?:[^A-Za-zÄÖÜäöüß]|$)`, 'gi');
  const hits = [...text.matchAll(hitRe)];
  if (!hits.length) return false;
  return hits.every((m) => {
    const idx = m.index ?? 0;
    const window = text.slice(Math.max(0, idx - 12), idx + kw.length + 4);
    return rules.some((r) => {
      r.re.lastIndex = 0;
      return r.re.test(window);
    });
  });
}

function keywordsForTopic(topic) {
  const base = TOPIC_KEYWORDS[topic] || [];
  const extra = HOREN_TOPIC_EXTRAS[topic] || [];
  const seen = new Set();
  const out = [];
  for (const kw of [...base, ...extra]) {
    const key = kw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
  }
  return out;
}

/**
 * Score topics for a passage (title + text). Word-boundary + Hören extras.
 * @returns {{ scores: Record<string, number>, best: string|null, bestScore: number, tagScore: number }}
 */
export function scorePassageTopics(passage, topicTag = null) {
  const blob = [passage?.title, passage?.text, passage?.transcript]
    .filter((s) => typeof s === 'string' && s.trim())
    .join('\n');
  const scores = {};

  for (const topic of Object.keys(TOPIC_KEYWORDS)) {
    let n = 0;
    for (const kw of keywordsForTopic(topic)) {
      if (!keywordHit(blob, kw)) continue;
      if (keywordOnlyInIdiom(blob, kw)) continue;
      n++;
    }
    if (n) scores[topic] = n;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const best = ranked[0]?.[0] || null;
  const bestScore = ranked[0]?.[1] || 0;
  const tagScore = topicTag ? scores[topicTag] || 0 : 0;
  return { scores, best, bestScore, tagScore };
}

/**
 * @param {object} passage
 * @returns {{ mismatch: boolean, detected: string|null, tag: string|null, reason?: string, detail?: string }}
 */
export function checkPassageContentTopic(passage) {
  const tag = passage?.topicTag ? String(passage.topicTag) : null;
  if (!tag) return { mismatch: false, detected: null, tag: null };

  const { best, bestScore, tagScore, scores } = scorePassageTopics(passage, tag);

  // B) Declared tag has zero lexical support and no alternative either.
  if (tagScore === 0 && bestScore === 0) {
    return {
      mismatch: true,
      detected: null,
      tag,
      reason: 'tag_unsupported',
      detail:
        `passage:${passage.id || '?'} topicTag «${tag}» sin soporte léxico en el contenido ` +
        `(tag score=0, ningún tema alternativo con hits; hits={})`,
    };
  }

  if (!best || bestScore <= 0) return { mismatch: false, detected: null, tag };

  // A) Content clearly prefers another topic (strictly higher score than the tag).
  if (best !== tag && bestScore > tagScore) {
    const compat = topicsAreCompatible(tag, best);
    if (!compat.match && compat.reason === 'topic_mismatch') {
      return {
        mismatch: true,
        detected: best,
        tag,
        reason: 'topic_mismatch',
        detail:
          `passage:${passage.id || '?'} topicTag «${tag}» no encaja con contenido ` +
          `(detectado «${best}» score=${bestScore} vs tag score=${tagScore}; ` +
          `hits=${JSON.stringify(scores)})`,
      };
    }
  }
  return { mismatch: false, detected: best, tag };
}
