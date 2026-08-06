/**
 * levelPlanner.mjs — shared level-aware topics, Teile, and seed paths for pool/vocab-bg.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { normalizeLevel } from './batchPaths.mjs';
import { layoutForLevel } from './examLevelCells.mjs';

const require = createRequire(import.meta.url);
const { B1_TOPICS, normalizeB1Topic } = require(path.join(ROOT, 'js/data/b1Topics.js'));

/** Canonical topic slugs per level (A2 seed uses same German labels as B1). */
export function topicsForLevel(level = 'B1') {
  const lv = normalizeLevel(level);
  if (lv === 'A2') {
    return B1_TOPICS;
  }
  return B1_TOPICS;
}

export function normalizeTopicForLevel(level, topic) {
  return normalizeB1Topic(topic);
}

export function seedPathsForLevel(lang = 'de', level = 'B1') {
  const lv = normalizeLevel(level);
  const l = String(lang).toLowerCase();
  return [
    `library/reusable-seed/${l}_${lv}.json`,
    `library/reusable-seed/${l}_${lv}.bank.json`,
  ];
}

export function generationModulesForLevel(level = 'B1') {
  const layout = layoutForLevel(level);
  return {
    lesen: [...layout.lesen],
    horen: [...layout.horen],
    schreiben: [...layout.schreibenTeils],
    sprechen: [...layout.sprechenTeils],
  };
}

/** vocab-bg generates lesen + hören only. */
export function bgModulesForLevel(level = 'B1') {
  const m = generationModulesForLevel(level);
  return { lesen: m.lesen, horen: m.horen };
}

export function moduleTeilsForLevel(module, level = 'B1') {
  const m = generationModulesForLevel(level);
  return m[String(module).toLowerCase()] || [];
}

export function smokeCellsForLevel(level = 'B1') {
  const layout = layoutForLevel(level);
  return [
    ...layout.lesen.map((t) => ({ module: 'lesen', teil: t })),
    ...layout.horen.map((t) => ({ module: 'horen', teil: t })),
    ...layout.schreibenTeils.map((t) => ({ module: 'schreiben', teil: t })),
    ...layout.sprechenTeils.map((t) => ({ module: 'sprechen', teil: t })),
  ];
}
