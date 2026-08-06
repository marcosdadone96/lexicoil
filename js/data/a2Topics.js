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

// The bindings are prefixed on purpose. index.html loads b1Topics.js as a classic script
// immediately before this file, so its top-level `function foldTopicKey` / `const B1_TOPICS`
// / `function normalizeB1Topic` are already globals. Destructuring into those same names
// redeclared them in the same scope, which is a SyntaxError — and it is thrown at parse
// time, so the whole of a2Topics.js never ran and A2_OFFICIAL_TOPICS / normalizeA2Topic
// were undefined for examConfig.js and personalTopicStockFactory.js.
const { foldTopicKey: a2FoldTopicKey, B1_TOPICS: A2_B1_TOPICS, normalizeB1Topic: a2NormalizeB1Topic } = (() => {
  try {
    // eslint-disable-next-line global-require
    return require('./b1Topics.js');
  } catch {
    // Browser: reuse b1Topics' globals when present, fall back only if it did not load.
    return {
      foldTopicKey: typeof foldTopicKey === 'function'
        ? foldTopicKey
        : (s) => String(s || '').trim().toLowerCase(),
      B1_TOPICS: typeof B1_TOPICS !== 'undefined' ? B1_TOPICS : [],
      normalizeB1Topic: typeof normalizeB1Topic === 'function' ? normalizeB1Topic : (t) => t,
    };
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

  const key = a2FoldTopicKey(t);
  if (A2_TOPIC_ALIASES[key]) return A2_TOPIC_ALIASES[key];

  const fromB1 = a2NormalizeB1Topic(t);
  if (fromB1 && isOfficialA2Topic(fromB1)) return fromB1;

  for (const canonical of A2_OFFICIAL_TOPICS) {
    const cKey = a2FoldTopicKey(canonical);
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
    B1_TOPICS: A2_B1_TOPICS,
  });
}
