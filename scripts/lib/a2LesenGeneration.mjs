/**
 * A2 Lesen T1/T3/T4 — Gemini + plantillas A2 (no make-t3 ni debate seeds B1).
 */
import { normalizeLevel } from './batchPaths.mjs';

export function isA2Level(level) {
  return normalizeLevel(level) === 'A2';
}

/** Lesen T3 vía make-t3 (solo B1). A2/B2 = plantilla + Gemini. */
export function usesB1LesenT3MakeT3(level, teil) {
  return Number(teil) === 3 && normalizeLevel(level) === 'B1';
}

/** Lesen T4 foro/debate seeds (solo B1). B2 = Meinung↔Überschrift integrado. */
export function usesB1LesenT4DebateSeeds(level, teil) {
  return Number(teil) === 4 && normalizeLevel(level) === 'B1';
}

/** Stock T3 blueprints B1 — irrelevante para fill A2. */
export function skipB1LesenT3BlueprintStock(level, teil) {
  return Number(teil) === 3 && isA2Level(level);
}

/** Stock T4 debate seeds B1 — irrelevante para fill A2. */
export function skipB1LesenT4SeedStock(level, teil) {
  return Number(teil) === 4 && isA2Level(level);
}

/** Preflight stub: celda A2 T3/T4 siempre planificable vía Gemini. */
export function a2LesenGeminiStockStub() {
  return {
    generatable: true,
    compatibleTotal: 1,
    availableTotal: Number.POSITIVE_INFINITY,
    freshCount: 1,
    preflightOkCount: 1,
    pickTier: 'a2-gemini',
  };
}
