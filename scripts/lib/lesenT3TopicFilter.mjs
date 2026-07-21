/**
 * Lesen T3 — topic detection on situations only + compatibility with requested B1 topic.
 * Shared by CHK-26 (audit-pass-2) and make-t3 blueprint picker.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizeB1Topic } from './b1Topics.mjs';
import { topicsAreCompatible } from './qualityGates/topicFamilies.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { detectTopic } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

/**
 * Combinaciones tema×blueprint estructuralmente imposibles (mismo criterio que Konsum+bp-koffer-brille).
 * El filtro léxico puede dar falsos positivos (p. ej. «reparieren» → Arbeit en bp-schuhe-mode).
 * @type {Record<string, string[]>}
 */
export const TOPIC_BLUEPRINT_HARD_EXCLUDE = Object.freeze({
  Konsum: ['bp-koffer-brille'],
  Arbeit: ['bp-schuhe-mode'],
});

/**
 * Blueprints permitidos por tema aunque detectTopic en situaciones no coincida
 * (p. ej. bp-familie detecta Bildung pero sirve para Familie).
 * @type {Record<string, string[]>}
 */
export const TOPIC_BLUEPRINT_PREFERENCE = Object.freeze({
  Gesundheit: ['bp-gesundheit'],
  Ernährung: ['bp-ernaehrung'],
  Familie: ['bp-familie'],
  Umwelt: ['bp-umwelt'],
  Kultur: ['bp-musik'],
  Freizeit: ['bp-freizeit-garten', 'bp-reparatur-kurse'],
});

/** Situation prompts only — never the shared A–J distractor list. */
export function collectT3SituationText(questions) {
  return (questions || [])
    .map((q) => String(q?.question || '').trim())
    .filter(Boolean)
    .join(' ');
}

/** @returns {string|null} best-effort topic from situation lines */
export function detectTopicFromT3Situations(questions) {
  const text = collectT3SituationText(questions);
  return text ? detectTopic(text) : null;
}

/**
 * @param {string|null|undefined} expected requested / batch topic
 * @param {string|null|undefined} detected from situation text
 */
export function isLesenT3TopicCompatible(expected, detected) {
  const exp = normalizeB1Topic(expected);
  if (!exp) return true;
  if (!detected) return true;
  const det = normalizeB1Topic(detected);
  if (!det || det === exp) return true;
  return topicsAreCompatible(exp, det).match;
}

/**
 * Drop blueprints whose situation aggregate topic is incompatible with requestedTopic.
 * @param {object[]} blueprints
 * @param {string|null|undefined} requestedTopic
 */
export function isBlueprintHardExcludedForTopic(requestedTopic, slug) {
  const topic = normalizeB1Topic(requestedTopic);
  if (!topic || !slug) return false;
  const blocked = TOPIC_BLUEPRINT_HARD_EXCLUDE[topic];
  return Array.isArray(blocked) && blocked.includes(String(slug));
}

export function isBlueprintPreferredForTopic(requestedTopic, slug) {
  const topic = normalizeB1Topic(requestedTopic);
  if (!topic || !slug) return false;
  const preferred = TOPIC_BLUEPRINT_PREFERENCE[topic];
  return Array.isArray(preferred) && preferred.includes(String(slug));
}

export function filterBlueprintsForTopic(blueprints, requestedTopic) {
  if (!requestedTopic) return blueprints;
  const topic = normalizeB1Topic(requestedTopic);
  const preferred = TOPIC_BLUEPRINT_PREFERENCE[topic];
  const hasPreferred = Array.isArray(preferred) && preferred.length > 0;
  return (blueprints || []).filter((bp) => {
    const slug = bp.slug || bp._file?.replace(/\.json$/, '') || '';
    if (isBlueprintHardExcludedForTopic(requestedTopic, slug)) return false;
    if (isBlueprintPreferredForTopic(requestedTopic, slug)) return true;
    if (hasPreferred) return false;
    return isLesenT3TopicCompatible(
      requestedTopic,
      detectTopicFromT3Situations(bp.questions),
    );
  });
}
