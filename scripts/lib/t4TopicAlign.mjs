/**
 * t4TopicAlign.mjs — P3: Lesen T4 debate must match requested B1 topic.
 *
 * Uses debate-mold affinity (primary) + detectTopic on intro (secondary).
 * Conservative: prefer false negatives over blocking borderline OK debates.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './loadEnv.mjs';
import { normalizeB1Topic } from './b1Topics.mjs';
import {
  detectT4DebateTopic,
  getDebateById,
  T4_TOPIC_DEBATE_BLOCKED,
  T4_TOPIC_DEBATE_PREFERENCE,
} from './lesenSubtypeRotation.mjs';

const require = createRequire(import.meta.url);
const { TOPIC_KEYWORDS, detectTopic } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

/**
 * B1 topics each debate mold legitimately serves.
 * Narrow on purpose — e.g. homeoffice → Arbeit only (not Technik).
 */
export const T4_DEBATE_TOPIC_AFFINITY = Object.freeze({
  autofrei: ['Verkehr', 'Umwelt', 'Stadtleben'],
  handy_schule: ['Technik', 'Medien', 'Bildung'],
  vier_tage_woche: ['Arbeit'],
  muelltrennung: ['Umwelt', 'Stadtleben', 'Wohnen'],
  homeoffice: ['Arbeit'],
  oepnv_kostenlos: ['Verkehr', 'Stadtleben', 'Umwelt'],
  vereinsfoerderung: ['Freizeit', 'Sport', 'Kultur'],
  schwimmbad_gratis: ['Freizeit', 'Sport', 'Gesundheit'],
  sport_in_parks: ['Freizeit', 'Sport', 'Stadtleben', 'Gesundheit'],
  hobby_kurse: ['Freizeit', 'Bildung', 'Kultur'],
  bibliothek_sonntag: ['Freizeit', 'Bildung', 'Kultur', 'Medien'],
  mensa_vegetarisch: ['Ernährung', 'Arbeit', 'Bildung'],
  nachtruhe: ['Wohnen', 'Stadtleben', 'Familie'],
  hunde_spielplatz: ['Wohnen', 'Stadtleben', 'Familie'],
  social_media_16: ['Technik', 'Medien', 'Familie', 'Bildung'],
  ki_regulierung: ['Technik', 'Medien'],
  online_unterricht: ['Technik', 'Bildung', 'Medien'],
  video_ueberwachung: ['Technik', 'Stadtleben', 'Wohnen'],
  smart_home: ['Technik', 'Wohnen', 'Medien'],
  datenschutz_jugend: ['Technik', 'Medien', 'Familie', 'Bildung'],
  ki_hausaufgaben: ['Technik', 'Bildung', 'Medien'],
  bildschirmzeit: ['Technik', 'Medien', 'Familie', 'Bildung'],
});

/** Debates que solo encajan con tema Arbeit — nunca Technik/Bildung/etc. */
const T4_ARBEIT_ONLY_DEBATES = new Set(['homeoffice', 'vier_tage_woche']);

/** Pre-pick: evita ofrecer moldes que CHK-27 rechazaría por debate_mold / Arbeit-only. */
export function isT4DebateMoldCompatible(topicTag, debateId) {
  const topic = normalizeB1Topic(topicTag);
  if (!topic || !debateId) return true;
  const blocked = T4_TOPIC_DEBATE_BLOCKED[topic] || [];
  if (blocked.includes(debateId)) return false;
  if (T4_ARBEIT_ONLY_DEBATES.has(debateId) && topic !== 'Arbeit') return false;
  const affinity = T4_DEBATE_TOPIC_AFFINITY[debateId] || [];
  if (!affinity.length) return true;
  if (affinity.includes(topic)) return true;
  const preferred = T4_TOPIC_DEBATE_PREFERENCE[topic] || [];
  return preferred.includes(debateId);
}

/**
 * Temas detectados aceptables aunque ≠ topicTag pedido (adyacencia semántica B1).
 * Cada par es bidireccional: Ernährung↔Gesundheit, Gesundheit↔Sport, etc.
 */
export const T4_TOPIC_ADJACENCY_ACCEPT = Object.freeze({
  Ernährung: ['Gesundheit'],
  Gesundheit: ['Ernährung', 'Sport'],
  Sport: ['Gesundheit'],
  Verkehr: ['Stadtleben'],
  Stadtleben: ['Verkehr', 'Wohnen'],
  Wohnen: ['Stadtleben'],
  Freizeit: ['Kultur'],
  Kultur: ['Freizeit'],
  Medien: ['Technik'],
  Technik: ['Medien'],
});

export function isAdjacentB1Topic(expected, detected) {
  if (!detected || !expected || detected === expected) return true;
  return (T4_TOPIC_ADJACENCY_ACCEPT[expected] || []).includes(detected);
}

export function countTopicKeywordHits(text, topic) {
  const keywords = TOPIC_KEYWORDS[topic];
  if (!keywords || !text) return 0;
  const lower = String(text).toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
}

function collectT4Texts(batch) {
  const t4qs = (batch.questions || []).filter(
    (q) => String(q.module || '').toLowerCase() === 'lesen' && Number(q.teil) === 4,
  );
  const p0 = batch.passages?.[0] || batch.passage || {};
  const title = String(p0.title || p0.textTitle || '');
  const intro = String(p0.text || '');
  const signTexts = t4qs.map((q) => String(q.signText || '')).filter(Boolean);
  return { t4qs, title, intro, signTexts, fullText: [title, intro, ...signTexts].join('\n') };
}

/** Goethe A2 Lesen T4 = six short ads (Anzeigen), not B1 Stadtforum debate. */
function isGoetheA2AnzeigenLesenT4(batch) {
  const level = String(batch?.level || batch?.questions?.[0]?.level || '').toUpperCase();
  if (level !== 'A2') return false;
  const ps = batch?.passages || [];
  if (ps.length < 4) return false;
  return ps.every((p) => /^(ad-|gen-l4-)/i.test(String(p.id || '')));
}

/**
 * @returns {{ ok: boolean, skip?: boolean, reason?: string, expected?: string, debateId?: string|null, debateLabel?: string, affinity?: string[], detected?: string|null, introDetected?: string|null, expectedHits?: number, detectedHits?: number }}
 */
export function assessT4TopicAlignment(batch) {
  const expected = normalizeB1Topic(batch?.topicTag || batch?._requestedTopic);
  if (!expected) return { ok: true, skip: true };

  const { t4qs, title, intro, signTexts, fullText } = collectT4Texts(batch);
  if (!t4qs.length) return { ok: true, skip: true };

  if (isGoetheA2AnzeigenLesenT4(batch)) {
    return { ok: true, skip: true, reason: 'a2_anzeigen_t4' };
  }

  const level = String(batch?.level || batch?.questions?.[0]?.level || '').toUpperCase();
  const b2Matching = level === 'B2' && t4qs.some((q) => String(q.type || '').toLowerCase() === 'matching');
  if (b2Matching) {
    return { ok: true, skip: true, reason: 'b2_opinion_headline_t4' };
  }

  const fixedSeed = batch._debateSeed || batch.debateSeed || null;
  const debateId = fixedSeed
    ? null
    : detectT4DebateTopic({
      passages: batch.passages || (intro ? [{ title, text: intro }] : []),
      passage: batch.passage,
      questions: batch.questions,
      debateTopic: batch.debateTopic || batch._debateTopic,
    });
  const debateDef = debateId ? getDebateById(debateId) : null;
  const affinity = debateId ? (T4_DEBATE_TOPIC_AFFINITY[debateId] || []) : [];
  const preferred = T4_TOPIC_DEBATE_PREFERENCE[expected] || [];

  const detected = normalizeB1Topic(detectTopic(fullText));
  const introDetected = normalizeB1Topic(detectTopic(intro));
  const expectedHits = countTopicKeywordHits(fullText, expected);
  const detectedHits = detected ? countTopicKeywordHits(fullText, detected) : 0;
  const seedHits = fixedSeed ? countTopicKeywordHits(fixedSeed, expected) : 0;

  const base = {
    expected,
    debateId,
    debateSeed: fixedSeed,
    debateLabel: fixedSeed || debateDef?.label || debateId,
    affinity,
    detected,
    introDetected,
    expectedHits,
    detectedHits,
    seedHits,
  };

  // Rule A0 — Arbeit-only molds (Homeoffice, 4-Tage-Woche) nunca fuera de Arbeit
  if (!fixedSeed && debateId && T4_ARBEIT_ONLY_DEBATES.has(debateId) && expected !== 'Arbeit') {
    return {
      ...base,
      ok: false,
      reason: 'debate_mold',
    };
  }

  // Rule A — known debate mold vs requested topic (legacy batches without fixed seed)
  if (!fixedSeed && debateId && affinity.length && !affinity.includes(expected) && !preferred.includes(debateId)) {
    return {
      ...base,
      ok: false,
      reason: 'debate_mold',
    };
  }

  // Rule B — intro topic contradicts expected (Homeoffice intro + Technik tag)
  if (introDetected && introDetected !== expected && !isAdjacentB1Topic(expected, introDetected)) {
    const introExp = countTopicKeywordHits(intro, expected);
    const introDet = countTopicKeywordHits(intro, introDetected);
    if (introDet >= 2 && introExp === 0) {
      return {
        ...base,
        ok: false,
        reason: 'intro_topic',
      };
    }
  }

  // Rule C — full-text detectTopic only when debate unknown AND strong mismatch
  if (
    !fixedSeed
    && !debateId
    && detected
    && detected !== expected
    && !isAdjacentB1Topic(expected, detected)
    && detectedHits >= 3
    && expectedHits === 0
  ) {
    return {
      ...base,
      ok: false,
      reason: 'content_topic',
    };
  }

  return { ...base, ok: true };
}

export function formatT4TopicAlignmentFailure(assessment) {
  if (assessment.ok || assessment.skip) return '';
  const {
    expected, debateLabel, debateId, affinity, detected, introDetected, reason,
  } = assessment;
  if (reason === 'debate_mold') {
    return (
      `Lesen T4: debate «${debateLabel || debateId}» no encaja con tema pedido «${expected}» ` +
      `(válido: ${(affinity || []).join(', ') || '—'}). El foro debe tratar de «${expected}».`
    );
  }
  if (reason === 'intro_topic') {
    return (
      `Lesen T4: intro del foro detectada como «${introDetected}» ≠ tema pedido «${expected}». ` +
      `El debate debe girar sobre «${expected}».`
    );
  }
  if (reason === 'content_topic') {
    return (
      `Lesen T4: contenido detectado como «${detected}» ≠ tema pedido «${expected}». ` +
      `Todas las opiniones deben tratar del tema «${expected}».`
    );
  }
  return `Lesen T4: debate no alineado con tema pedido «${expected}».`;
}
