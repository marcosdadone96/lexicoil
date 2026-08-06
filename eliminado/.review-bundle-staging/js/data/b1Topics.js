/**
 * Canonical closed B1 topic list (Goethe) — shared terminal + web.
 * Internal value = German label used in prompts and topicTag.
 */
const B1_TOPICS = Object.freeze([
  'Reisen',
  'Gesundheit',
  'Arbeit',
  'Technik',
  'Medien',
  'Wohnen',
  'Konsum',
  'Bildung',
  'Familie',
  'Umwelt',
  'Ernährung',
  'Kultur',
  'Sport',
  'Freizeit',
  'Verkehr',
  'Stadtleben',
]);

/** knowledge/languages/german.json topics.B1 + common UI long labels → canonical */
const B1_TOPIC_ALIASES = Object.freeze({
  'umwelt und nachhaltigkeit': 'Umwelt',
  'gesundheit und ernaehrung': 'Gesundheit',
  'gesundheit und ernährung': 'Gesundheit',
  'gesundheit und sport': 'Gesundheit',
  'arbeit und beruf': 'Arbeit',
  'bildung und lernen': 'Bildung',
  'technologie im alltag': 'Technik',
  'reisen und interkulturelle begegnungen': 'Reisen',
  'reisen und verkehr': 'Verkehr',
  'medien und kommunikation': 'Medien',
  'freizeit und hobby': 'Freizeit',
  'familie und freunde': 'Familie',
  'wohnen und haushalt': 'Wohnen',
  'kultur und freizeit': 'Kultur',
  'sport und fitness': 'Sport',
  'ernährung und kochen': 'Ernährung',
  'konsum und einkaufen': 'Konsum',
  'stadt und stadtleben': 'Stadtleben',
  technologie: 'Technik',
});

function foldTopicKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function detectTopicFromText(text) {
  if (typeof detectTopic === 'function') return detectTopic(text);
  if (typeof window !== 'undefined' && typeof window.detectTopic === 'function') {
    return window.detectTopic(text);
  }
  try {
    // eslint-disable-next-line global-require
    const mod = require('../engine/partTopicDetect.js');
    return mod.detectTopic ? mod.detectTopic(text) : null;
  } catch {
    return null;
  }
}

function isValidB1Topic(topic) {
  if (!topic || typeof topic !== 'string') return false;
  return B1_TOPICS.includes(topic.trim());
}

/**
 * Map UI / knowledge long labels → canonical B1 topic for factory + pool index.
 * Returns null when no mapping is possible.
 */
function normalizeB1Topic(topic) {
  const t = String(topic || '').trim();
  if (!t) return null;
  if (isValidB1Topic(t)) return t;

  const key = foldTopicKey(t);
  if (B1_TOPIC_ALIASES[key]) return B1_TOPIC_ALIASES[key];

  for (const canonical of B1_TOPICS) {
    const cKey = foldTopicKey(canonical);
    if (key === cKey) return canonical;
    if (key.startsWith(`${cKey} und `) || key.startsWith(`${cKey} im `)) return canonical;
  }

  const detected = detectTopicFromText(t);
  if (detected && isValidB1Topic(detected)) return detected;

  return null;
}

if (typeof window !== 'undefined') {
  window.B1Topics = Object.freeze({ B1_TOPICS, isValidB1Topic, normalizeB1Topic, B1_TOPIC_ALIASES });
}
if (typeof module !== 'undefined') {
  module.exports = Object.freeze({
    B1_TOPICS,
    isValidB1Topic,
    normalizeB1Topic,
    B1_TOPIC_ALIASES,
    foldTopicKey,
  });
}
