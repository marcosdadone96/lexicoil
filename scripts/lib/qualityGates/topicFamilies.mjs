/**
 * Familias semánticas de topicTag / _requestedTopic (Q4).
 * Solo equivalencias explícitas — sin LLM.
 */
import { normalizeB1Topic } from '../b1Topics.mjs';

/** Slugs legacy del generador que no mapean a B1_TOPICS — no bloquear, solo warn. */
export const LEGACY_TOPIC_SLUGS = new Set([
  'daily_life',
  'work_life',
  'health_fitness',
]);

/** Grupos de topics canónicos que se consideran la misma familia. */
export const TOPIC_FAMILY_GROUPS = [
  ['Arbeit'],
  ['Gesundheit', 'Ernährung'],
  ['Kultur', 'Freizeit'],
  ['Reisen', 'Verkehr'],
  ['Technik', 'Medien'],
  ['Wohnen', 'Konsum', 'Stadtleben'],
  ['Bildung'],
  ['Familie'],
  ['Umwelt'],
  ['Sport'],
];

const familyByTopic = new Map();
for (const group of TOPIC_FAMILY_GROUPS) {
  for (const t of group) {
    familyByTopic.set(t, group);
  }
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {{ match: boolean, reason: string, canonicalA?: string, canonicalB?: string }}
 */
export function topicsAreCompatible(a, b) {
  const canonicalA = normalizeB1Topic(a);
  const canonicalB = normalizeB1Topic(b);
  if (!canonicalA || !canonicalB) {
    return { match: false, reason: 'unmapped_topic' };
  }
  if (canonicalA === canonicalB) {
    return { match: true, reason: 'exact', canonicalA, canonicalB };
  }
  const groupA = familyByTopic.get(canonicalA);
  const groupB = familyByTopic.get(canonicalB);
  if (groupA && groupB && groupA === groupB) {
    return { match: true, reason: 'family', canonicalA, canonicalB };
  }
  return { match: false, reason: 'topic_mismatch', canonicalA, canonicalB };
}
