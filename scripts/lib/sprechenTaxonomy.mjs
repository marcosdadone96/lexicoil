/**
 * sprechenTaxonomy.mjs — canonical types + topicTags for Goethe Sprechen (B1 SP-2, A2 official).
 */
import { normalizeB1Topic, isValidB1Topic, B1_TOPICS } from './b1Topics.mjs';

/** Canonical question.type by Teil — Goethe B1. */
export const SPRECHEN_TYPE_BY_TEIL = Object.freeze({
  1: 'planungsaufgabe',
  2: 'praesentation',
  3: 'feedback_diskussion',
});

/** Canonical question.type by Teil — Goethe A2 (Modellsatz Erwachsene). */
export const SPRECHEN_TYPE_BY_TEIL_A2 = Object.freeze({
  1: 'personal_questions',
  2: 'about_self',
  3: 'plan_together',
});

/** Legacy / variant type → canonical (when teil unknown, use this map). */
const TYPE_ALIASES = Object.freeze({
  short_answer: null, // resolve via teil
  planungsaufgabe: 'planungsaufgabe',
  praesentation: 'praesentation',
  praesentationsaufgabe: 'praesentation',
  feedback: 'feedback_diskussion',
  feedback_diskussion: 'feedback_diskussion',
  feedback_und_fragen: 'feedback_diskussion',
  diskussion: 'feedback_diskussion',
  personal_questions: 'personal_questions',
  about_self: 'about_self',
  plan_together: 'plan_together',
  speaking_task: null,
  oral_task: null,
  speaking: null,
  sprechen: null,
  rubric: null,
});

/**
 * English merged-pool tags → B1_TOPICS (SP-2.5b).
 * society → Familie (default; content may override via normalizeB1Topic on question text).
 */
export const SPRECHEN_EN_TOPIC_MAP = Object.freeze({
  culture: 'Kultur',
  food: 'Ernährung',
  travel: 'Reisen',
  sport: 'Sport',
  shopping: 'Konsum',
  work: 'Arbeit',
  free_time: 'Freizeit',
  society: 'Familie',
  daily_life: null, // must be replaced by chosenTopic / content
});

/**
 * @param {string|null|undefined} rawType
 * @param {number|string|null|undefined} teil
 * @returns {string}
 */
export function canonicalSprechenType(rawType, teil, level = 'B1') {
  const t = Number(teil);
  const lv = String(level || 'B1').trim().toUpperCase();
  const byTeilMap = lv === 'A2' ? SPRECHEN_TYPE_BY_TEIL_A2 : SPRECHEN_TYPE_BY_TEIL;
  const byTeil = byTeilMap[t];
  const key = String(rawType || '').toLowerCase().trim();
  if (key && Object.prototype.hasOwnProperty.call(TYPE_ALIASES, key)) {
    const mapped = TYPE_ALIASES[key];
    if (mapped) return mapped;
  }
  if (byTeil) return byTeil;
  if (lv === 'A2') {
    if (key === 'personal_questions' || key === 'about_self' || key === 'plan_together') return key;
    return byTeil || 'personal_questions';
  }
  if (key === 'planungsaufgabe' || key === 'praesentation' || key === 'feedback_diskussion') return key;
  return byTeil || 'planungsaufgabe';
}

/**
 * Map any topic tag (EN merged / legacy / B1) → canonical B1_TOPICS label.
 * @param {string|null|undefined} tag
 * @param {string|null} [fallbackTopic] — chosenTopic from generation
 * @returns {string|null}
 */
export function mapSprechenTopicTag(tag, fallbackTopic = null) {
  const raw = String(tag || '').trim();
  if (!raw) return fallbackTopic && isValidB1Topic(fallbackTopic) ? fallbackTopic : null;

  const en = SPRECHEN_EN_TOPIC_MAP[raw.toLowerCase()];
  if (en) return en;
  if (raw.toLowerCase() === 'daily_life') {
    return fallbackTopic && isValidB1Topic(fallbackTopic) ? fallbackTopic : null;
  }

  const normalized = normalizeB1Topic(raw);
  if (normalized) return normalized;
  if (fallbackTopic && isValidB1Topic(fallbackTopic)) return fallbackTopic;
  return null;
}

/**
 * @param {string[]|string|null|undefined} value
 * @param {string|null} [rootTopicTag]
 * @returns {string[]|null}
 */
export function normalizeSprechenTopicTags(value, rootTopicTag = null) {
  const first = Array.isArray(value) ? value[0] : value;
  const mapped = mapSprechenTopicTag(first, rootTopicTag);
  if (mapped) return [mapped];
  if (rootTopicTag && isValidB1Topic(rootTopicTag)) return [rootTopicTag];
  return null;
}

export { B1_TOPICS, isValidB1Topic };
