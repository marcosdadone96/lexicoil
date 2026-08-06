/**
 * stagingQualityBridge.mjs — PASO 9/10 staging ↔ quality gates.
 * Does not mutate Blobs storage unless caller persists the returned candidate.
 */
import { STAGING_STATUS, toStagingHint, runQualityGates } from './qualityGateRunner.mjs';
import {
  canPromotePart,
  buildQualityMetadata,
  partFromStagingCandidate,
  loadQualityGatePolicy,
} from './qualityGatePolicy.mjs';

export function suggestStagingStatusFromQualityReport(report) {
  return toStagingHint(report);
}

/**
 * Attach quality report + qualityMetadata onto a candidate copy.
 */
export function attachQualityReportToCandidate(candidate, report) {
  const qualityMetadata = report.qualityMetadata || buildQualityMetadata(report);
  return {
    ...candidate,
    qualityMetadata,
    qualityReport: {
      status: report.status,
      stagingStatus: report.stagingStatus || STAGING_STATUS[report.status],
      summary: report.summary,
      gates: report.gates,
      generatedAt: report.generatedAt,
      policyMode: report.policyMode || report.mode,
      mode: report.mode,
    },
    _suggestedStatus: report.stagingStatus,
  };
}

/**
 * Run gates on a staging candidate and return enrichment + promotion decision.
 * Does NOT write to store.
 */
export async function evaluateStagingCandidate(candidate, opts = {}) {
  const part = partFromStagingCandidate(candidate);
  const policy = loadQualityGatePolicy({ mode: opts.policyMode, policy: opts.policy });
  const report = await runQualityGates({
    part,
    source: `staging:${candidate?.id || ''}`,
    level: candidate?.level || 'B1',
    lang: candidate?.lang || 'de',
    teil: candidate?.teil,
    policyMode: policy.mode,
    checkedBy: opts.checkedBy || 'system',
    feedbackRules: opts.feedbackRules,
  });
  const promotion = canPromotePart(report, {
    mode: policy.mode,
    manualReviewed: opts.manualReviewed,
    forceApprove: opts.forceApprove,
  });
  const enriched = attachQualityReportToCandidate(candidate, report);
  return { report, promotion, candidate: enriched, policy };
}

export { STAGING_STATUS, canPromotePart, loadQualityGatePolicy };
