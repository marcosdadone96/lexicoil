/**
 * partFileBrake.mjs — per-file cost/attempt limits during one generation run.
 * Stops ONE basename without killing the whole cell/batch (generate-cli continues).
 */

export const DEFAULT_MAX_ATTEMPTS_PER_FILE = 10;
export const DEFAULT_MAX_COST_PER_FILE_USD = 0.3;

export class PartFileBrakeError extends Error {
  /** @param {{ reason: string, apiCalls: number, costUsd: number, relFile?: string, limit?: number }} brake */
  constructor(brake) {
    const label =
      brake.reason === 'max-cost-per-file'
        ? `costo ≥ $${Number(brake.limit).toFixed(2)}`
        : `≥${brake.limit} llamadas API`;
    super(
      `FRENO por archivo (${brake.relFile || '?'}): ${label} — ` +
        `${brake.apiCalls} llamadas · $${brake.costUsd.toFixed(3)} acumulado`,
    );
    this.name = 'PartFileBrakeError';
    this.brake = brake;
  }
}

export function resolvePartFileLimits(args = {}) {
  const maxAttempts =
    args.maxAttemptsPerFile != null
      ? Math.max(1, Number(args.maxAttemptsPerFile))
      : DEFAULT_MAX_ATTEMPTS_PER_FILE;
  const maxCost =
    args.maxCostPerFileUsd != null
      ? Math.max(0.01, Number(args.maxCostPerFileUsd))
      : DEFAULT_MAX_COST_PER_FILE_USD;
  return { maxAttemptsPerFile: maxAttempts, maxCostPerFileUsd: maxCost };
}

/** Reset counters at the start of generateLlmPart / generateExamPart. */
export function initPartFileTracker(session, args, meta = {}) {
  if (!session) return;
  session._partFile = {
    relFile: meta.relFile || null,
    apiCalls: 0,
    costUsd: 0,
    fixIterations: 0,
    startedAt: Date.now(),
    ...resolvePartFileLimits(args),
  };
}

export function incrementPartFileFixIteration(session) {
  if (!session?._partFile) return 0;
  session._partFile.fixIterations += 1;
  return session._partFile.fixIterations;
}

/** Called after each billed API call (trackGeminiUsage). */
export function recordPartFileApiCall(session, costUsd = 0) {
  if (!session?._partFile) return;
  session._partFile.apiCalls += 1;
  session._partFile.costUsd += Number(costUsd) || 0;
}

export function getPartFileStats(session) {
  const pf = session?._partFile;
  if (!pf) {
    return { apiCalls: 0, costUsd: 0, fixIterations: 0, relFile: null };
  }
  return {
    apiCalls: pf.apiCalls,
    costUsd: Number(pf.costUsd.toFixed(6)),
    fixIterations: pf.fixIterations,
    relFile: pf.relFile,
    maxAttemptsPerFile: pf.maxAttemptsPerFile,
    maxCostPerFileUsd: pf.maxCostPerFileUsd,
  };
}

export function formatPartFileCostLabel(session) {
  const { costUsd } = getPartFileStats(session);
  return `$${costUsd.toFixed(3)} acumulado`;
}

/**
 * @returns {{ tripped: boolean, reason?: string, apiCalls: number, costUsd: number, limit?: number, relFile?: string }}
 */
export function checkPartFileBrake(session, args) {
  const pf = session?._partFile;
  const stats = getPartFileStats(session);
  if (!pf) return { tripped: false, ...stats };

  if (stats.apiCalls >= pf.maxAttemptsPerFile) {
    return {
      tripped: true,
      reason: 'max-attempts-per-file',
      apiCalls: stats.apiCalls,
      costUsd: stats.costUsd,
      limit: pf.maxAttemptsPerFile,
      relFile: pf.relFile,
    };
  }
  if (stats.costUsd >= pf.maxCostPerFileUsd) {
    return {
      tripped: true,
      reason: 'max-cost-per-file',
      apiCalls: stats.apiCalls,
      costUsd: stats.costUsd,
      limit: pf.maxCostPerFileUsd,
      relFile: pf.relFile,
    };
  }
  return { tripped: false, ...stats };
}

/** Throws PartFileBrakeError when limits already reached (call BEFORE next API call). */
export function assertPartFileBrake(session, args) {
  const brake = checkPartFileBrake(session, args);
  if (brake.tripped) throw new PartFileBrakeError(brake);
}

export function logPartFileOutcome(session, outcome = {}) {
  const stats = getPartFileStats(session);
  if (!stats.relFile && !session?._partFile) return stats;

  let status = 'DESCARTADO';
  if (outcome.ok) status = 'OK';
  else if (outcome.braked) status = 'FRENO';

  const rel = stats.relFile || '?';
  console.log(
    `\n── ${rel} · ${status} · ${stats.apiCalls} llamadas · $${stats.costUsd.toFixed(3)} total ──`,
  );
  if (outcome.braked && outcome.reason) {
    console.warn(`   Motivo freno: ${outcome.reason}`);
  }
  return stats;
}
