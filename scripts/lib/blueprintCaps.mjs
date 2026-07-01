/**
 * Hard blueprint caps — no Teil may exceed itemsTotal or passagesPerPart/segmentsTotal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const {
  countScorableItems,
  countPassagesInPart,
} = require(path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'));

export function bpPart(blueprint, modId, teil) {
  const mod = blueprint.modules.find((m) => m.id === modId);
  return (mod?.parts || []).find((p) => Number(p.teil) === Number(teil)) || null;
}

export function modulePartKey(modId) {
  if (modId === 'lesen') return 'lesenParts';
  if (modId === 'horen') return 'horenParts';
  if (modId === 'schreiben') return 'schreibenParts';
  if (modId === 'sprechen') return 'sprechenParts';
  return `${modId}Parts`;
}

/**
 * @returns {string[]} violation messages (empty = OK)
 */
export function assertBlueprintCaps(exam, blueprint, label = '') {
  const violations = [];
  for (const mod of blueprint.modules || []) {
    const key = modulePartKey(mod.id);
    for (const part of exam[key] || []) {
      const bp = bpPart(blueprint, mod.id, part.teil);
      if (!bp) continue;
      const expItems = bp.itemsTotal;
      const expPassages = bp.passagesPerPart ?? bp.segmentsTotal;
      const haveItems = countScorableItems(part, mod.id);
      if (expItems != null && haveItems > expItems) {
        violations.push(`${label}${mod.id} T${part.teil} items ${haveItems}/${expItems}`);
      }
      if (expPassages != null) {
        const havePassages = countPassagesInPart(part, bp);
        if (havePassages > expPassages) {
          violations.push(`${label}${mod.id} T${part.teil} passages ${havePassages}/${expPassages}`);
        }
      }
    }
  }
  return violations;
}

/**
 * Log and return false if exam violates caps (for aborting a single operation).
 */
export function abortIfOverCaps(exam, blueprint, context, log = console.warn) {
  const violations = assertBlueprintCaps(exam, blueprint);
  if (!violations.length) return true;
  log(`⚠ blueprint cap abort (${context}): ${violations.join('; ')}`);
  return false;
}

/**
 * Validate all curated exams for a level; returns violation strings.
 */
export function collectCuratedCapViolations(lang, level, blueprint, curatedDirFn, listFilesFn) {
  const violations = [];
  const dir = curatedDirFn(lang, level);
  for (const f of listFilesFn(lang, level)) {
    const w = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const exam = w.exam || w;
    const topic = w.topic || exam.topic || f;
    violations.push(...assertBlueprintCaps(exam, blueprint, `${topic}/`));
  }
  return violations;
}

export function assertCuratedCapsOrExit(lang, level, blueprint, curatedDirFn, listFilesFn) {
  const violations = collectCuratedCapViolations(lang, level, blueprint, curatedDirFn, listFilesFn);
  if (violations.length) {
    console.error(`\n✗ Blueprint cap violations in curated ${lang}_${level}:`);
    violations.slice(0, 20).forEach((v) => console.error(`  · ${v}`));
    if (violations.length > 20) console.error(`  … +${violations.length - 20} more`);
    process.exit(1);
  }
  console.log(`✓ Blueprint caps OK — curated ${lang}/${level}`);
}
