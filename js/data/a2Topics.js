/**
 * Goethe A2 official thematic axes (knowledge/languages/german.json topics.A2).
 * Pool seed may use any B1 slug; gap generation / official UI use these five only.
 */
const A2_OFFICIAL_TOPICS = Object.freeze([
  'Reisen',
  'Gesundheit',
  'Stadtleben',
  'Medien',
  'Umwelt',
]);

/** Long labels & variants → canonical slug (must be one of A2_OFFICIAL_TOPICS). */
const A2_TOPIC_ALIASES = Object.freeze({
  'reisen und urlaub': 'Reisen',
  'gesundheit und sport': 'Gesundheit',
  'stadtleben': 'Stadtleben',
  'medien und kommunikation': 'Medien',
  'natur und wetter': 'Umwelt',
  'natur und klima': 'Umwelt',
});

const { foldTopicKey, B1_TOPICS, normalizeB1Topic } = (() => {
  try {
    // eslint-disable-next-line global-require
    return require('./b1Topics.js');
  } catch {
    return { foldTopicKey: (s) => String(s || '').trim().toLowerCase(), B1_TOPICS: [], normalizeB1Topic: (t) => t };
  }
})();

function isOfficialA2Topic(topic) {
  return A2_OFFICIAL_TOPICS.includes(String(topic || '').trim());
}

/**
 * Normalize UI / knowledge labels to an official A2 slug when possible.
 * Non-official B1 slugs (e.g. Freizeit) pass through via normalizeB1Topic unchanged.
 */
function normalizeA2Topic(topic) {
  const t = String(topic || '').trim();
  if (!t) return null;
  if (isOfficialA2Topic(t)) return t;

  const key = foldTopicKey(t);
  if (A2_TOPIC_ALIASES[key]) return A2_TOPIC_ALIASES[key];

  const fromB1 = normalizeB1Topic(t);
  if (fromB1 && isOfficialA2Topic(fromB1)) return fromB1;

  for (const canonical of A2_OFFICIAL_TOPICS) {
    const cKey = foldTopicKey(canonical);
    if (key === cKey || key.startsWith(`${cKey} und `)) return canonical;
  }

  return fromB1;
}

/** Official axis label (german.json) → pool generation slug */
const A2_OFFICIAL_AXIS_TO_SLUG = Object.freeze({
  'Reisen und Urlaub': 'Reisen',
  'Gesundheit und Sport': 'Gesundheit',
  Stadtleben: 'Stadtleben',
  'Medien und Kommunikation': 'Medien',
  'Natur und Wetter': 'Umwelt',
});

if (typeof window !== 'undefined') {
  window.A2Topics = Object.freeze({
    A2_OFFICIAL_TOPICS,
    A2_TOPIC_ALIASES,
    A2_OFFICIAL_AXIS_TO_SLUG,
    isOfficialA2Topic,
    normalizeA2Topic,
  });
}
if (typeof module !== 'undefined') {
  module.exports = Object.freeze({
    A2_OFFICIAL_TOPICS,
    A2_TOPIC_ALIASES,
    A2_OFFICIAL_AXIS_TO_SLUG,
    isOfficialA2Topic,
    normalizeA2Topic,
    B1_TOPICS,
  });
}
