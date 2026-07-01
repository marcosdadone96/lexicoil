/**
 * Shared helpers for reusable-parts seed scripts (curated + bank).
 */
import {
  comboKey,
  resolveBlueprintForLangLevel,
  servedExamPath,
} from './examPipeline.mjs';

export { comboKey };

export function examsFileFor(lang, level) {
  return servedExamPath(lang, level);
}

export function defaultSeedOutJson(lang, level, suffix = '') {
  return `library/reusable-seed/${comboKey(lang, level)}${suffix}.json`;
}

export function loadBlueprintForCombo(lang, level) {
  const bp = resolveBlueprintForLangLevel(lang, level);
  if (!bp) {
    throw new Error(`No blueprint for ${comboKey(lang, level)}`);
  }
  return bp;
}

/** @param {object} blueprint */
export function requiredPartKeys(blueprint, modules = ['lesen', 'horen', 'schreiben']) {
  const keys = [];
  for (const modId of modules) {
    const mod = (blueprint?.modules || []).find((m) => String(m.id).toLowerCase() === modId);
    if (!mod?.parts?.length) continue;
    for (const p of mod.parts) {
      const teil = Number(p.teil ?? p.aufgabe);
      if (Number.isFinite(teil)) keys.push(`${modId}:t${teil}`);
    }
  }
  return keys;
}

/** Minimum pool depth per Teil when seeding from N curated exams (default 12). */
export function minPartsForKey(key, examCount = 12) {
  if (key.startsWith('schreiben:')) return Math.max(8, Math.floor(examCount * 0.66));
  return examCount;
}
