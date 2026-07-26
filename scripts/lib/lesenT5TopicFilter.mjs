/**
 * Lesen T5 — topic × institution subtype compatibility (mirrors lesenT3TopicFilter for T5).
 * Used at subtype pick time and in generation / pool-ready content-topic gates.
 */
import { normalizeB1Topic } from './b1Topics.mjs';
import { topicsAreCompatible } from './qualityGates/topicFamilies.mjs';
import { checkPassageContentTopic } from './qualityGates/contentTopicCheck.mjs';

/** Subtypes allowed ONLY for specific topics (e.g. markthalle → Konsum only). */
export const TOPIC_SUBTYPE_ONLY = Object.freeze({
  markthalle: ['Konsum'],
  einkaufszentrum: ['Konsum'],
  coworking: ['Technik', 'Arbeit', 'Medien'],
  leihgeraete: ['Technik', 'Bildung', 'Medien'],
  computerraum: ['Technik', 'Bildung', 'Medien'],
  fitness_app: ['Technik', 'Sport', 'Gesundheit'],
});

export const TOPIC_SUBTYPE_HARD_EXCLUDE = Object.freeze({
  Verkehr: ['schule', 'bibliothek', 'kantine', 'sportverein', 'freizeitzentrum', 'markthalle', 'einkaufszentrum'],
  Familie: ['sportverein', 'schule', 'kantine', 'markthalle', 'einkaufszentrum'],
  Konsum: ['bibliothek', 'schule', 'wohnanlage', 'sportverein'],
  Bildung: ['wohnanlage', 'kantine', 'sportverein', 'park', 'markthalle', 'einkaufszentrum'],
  Medien: ['wohnanlage', 'kantine', 'sportverein', 'park', 'markthalle', 'einkaufszentrum'],
  Gesundheit: ['schule', 'bibliothek', 'wohnanlage', 'park', 'markthalle', 'einkaufszentrum'],
  Sport: ['schule', 'bibliothek', 'wohnanlage', 'kantine', 'markthalle', 'einkaufszentrum'],
  Arbeit: ['sportverein', 'park', 'freizeitzentrum', 'markthalle', 'einkaufszentrum'],
  Umwelt: ['schule', 'kantine', 'sportverein', 'wohnanlage', 'markthalle', 'einkaufszentrum'],
  Reisen: ['schule', 'kantine', 'sportverein', 'wohnanlage', 'markthalle', 'einkaufszentrum'],
  Wohnen: ['schule', 'sportverein', 'kantine', 'markthalle', 'einkaufszentrum'],
  Ernährung: ['schule', 'bibliothek', 'wohnanlage', 'sportverein', 'markthalle', 'einkaufszentrum'],
  Technik: ['wohnanlage', 'kantine', 'sportverein', 'park', 'markthalle', 'einkaufszentrum'],
  Freizeit: ['schule', 'kantine', 'wohnanlage', 'markthalle', 'einkaufszentrum'],
  Kultur: ['schule', 'wohnanlage', 'kantine', 'markthalle', 'einkaufszentrum'],
  Stadtleben: ['schule', 'sportverein', 'kantine', 'markthalle', 'einkaufszentrum'],
});

/** Preferred subtypes when topic is fixed (first picks in rotation). */
export const TOPIC_SUBTYPE_PREFERENCE = Object.freeze({
  Verkehr: ['park'],
  Familie: ['wohnanlage', 'freizeitzentrum', 'park'],
  Wohnen: ['wohnanlage', 'park', 'freizeitzentrum'],
  Konsum: ['kantine', 'markthalle', 'einkaufszentrum', 'park', 'freizeitzentrum'],
  Gesundheit: ['kantine', 'sportverein', 'freizeitzentrum'],
  Sport: ['sportverein', 'freizeitzentrum', 'park'],
  Bildung: ['schule', 'bibliothek'],
  Medien: ['bibliothek', 'schule'],
  Ernährung: ['kantine'],
  Arbeit: ['kantine', 'schule', 'bibliothek'],
  Umwelt: ['park'],
  Freizeit: ['freizeitzentrum', 'sportverein', 'park'],
  Kultur: ['bibliothek', 'freizeitzentrum', 'park'],
  Reisen: ['bibliothek', 'freizeitzentrum', 'park'],
  Technik: ['coworking', 'leihgeraete', 'computerraum', 'fitness_app', 'bibliothek', 'schule'],
  Stadtleben: ['park', 'freizeitzentrum', 'bibliothek'],
});

export function isSubtypeHardExcludedForTopic(topicTag, subtypeId) {
  const topic = normalizeB1Topic(topicTag);
  const id = String(subtypeId || '').trim();
  if (!topic || !id) return false;
  const onlyFor = TOPIC_SUBTYPE_ONLY[id];
  if (onlyFor && !onlyFor.includes(topic)) return true;
  const blocked = TOPIC_SUBTYPE_HARD_EXCLUDE[topic];
  return Array.isArray(blocked) && blocked.includes(id);
}

/** Filter candidate subtype order for a topic. */
export function filterT5SubtypeOrder(order, topicTag) {
  return (order || []).filter((id) => !isSubtypeHardExcludedForTopic(topicTag, id));
}

/**
 * Post-generation gate: subtype allowed + passage content matches topicTag.
 * @returns {{ ok: true } | { ok: false, issue: string, rule?: string }}
 */
export function checkLesenT5BatchTopic(batch) {
  const topic = normalizeB1Topic(batch?.topicTag || batch?._requestedTopic);
  const subtype = batch?._textSubtype;
  if (topic && subtype && isSubtypeHardExcludedForTopic(topic, subtype)) {
    return {
      ok: false,
      rule: 't5_topic_subtype_mismatch',
      issue: `T5 subtipo «${subtype}» incompatible con tema «${topic}»`,
    };
  }
  for (const p of batch?.passages || []) {
    const tagged = { ...p, topicTag: batch.topicTag || p.topicTag || topic };
    const ct = checkPassageContentTopic(tagged);
    if (ct.mismatch) {
      return { ok: false, rule: 'content_topic_mismatch', issue: ct.detail || ct.reason };
    }
    if (topic && ct.detected && ct.tag) {
      const compat = topicsAreCompatible(ct.tag, ct.detected);
      if (!compat.match && ct.detected !== ct.tag) {
        return { ok: false, rule: 'content_topic_mismatch', issue: ct.detail || ct.reason };
      }
    }
  }
  return { ok: true };
}
