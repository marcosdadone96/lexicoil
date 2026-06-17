/**
 * Provenance metadata for curated exams (Strategy B).
 */
export function buildProvenance({
  generatedBy,
  validatedBy,
  blueprintId,
  cefrGate,
  sourceBankIds = [],
  validationErrors = [],
}) {
  return Object.freeze({
    generatedBy: generatedBy || 'pipeline/unknown',
    validatedBy: validatedBy || 'ExamValidator(strict)+CefrGate',
    blueprintId: blueprintId || null,
    cefrGate: cefrGate
      ? {
          withinRange: !!cefrGate.withinRange,
          metrics: cefrGate.metrics || {},
          reasons: cefrGate.reasons || [],
        }
      : null,
    sourceBankIds: [...new Set(sourceBankIds || [])],
    validationErrors: validationErrors || [],
    createdAt: new Date().toISOString(),
    strategy: 'B',
  });
}

export function isCuratedEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.curated !== true) return false;
  if (!entry.provenance?.validatedBy) return false;
  if (entry.provenance?.cefrGate && entry.provenance.cefrGate.withinRange === false) return false;
  return true;
}
