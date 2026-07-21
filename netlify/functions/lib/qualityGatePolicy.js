'use strict';

/**
 * qualityGatePolicy.js — PASO 10 promotion policy + canPromotePart.
 * Default mode is advisory (never blocks). Separates qualityMetadata from generationMetadata.
 */

const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, '../../../scripts/lib/qualityGates/qualityGatePolicy.json');
const MODES = Object.freeze(['advisory', 'review', 'enforced']);

const DEFAULT_POLICY = Object.freeze({
  mode: 'advisory',
  thresholds: {
    failBlocksPromotion: false,
    warningRequiresReview: true,
  },
  gates: {
    json_integrity: 'hard',
    goethe_structure: 'hard',
    cefr: 'warning',
    language_quality: 'warning',
    metadata_quality: 'warning',
  },
});

function normalizeMode(mode) {
  const m = String(mode || '').trim().toLowerCase();
  return MODES.includes(m) ? m : 'advisory';
}

/**
 * @param {{ mode?: string, policy?: object, policyPath?: string }} [opts]
 */
function loadQualityGatePolicy(opts = {}) {
  let base = { ...DEFAULT_POLICY, thresholds: { ...DEFAULT_POLICY.thresholds }, gates: { ...DEFAULT_POLICY.gates } };
  try {
    const p = opts.policyPath || POLICY_PATH;
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      base = {
        ...base,
        ...raw,
        thresholds: { ...base.thresholds, ...(raw.thresholds || {}) },
        gates: { ...base.gates, ...(raw.gates || {}) },
      };
    }
  } catch (_) {
    /* keep defaults */
  }
  if (opts.policy && typeof opts.policy === 'object') {
    base = {
      ...base,
      ...opts.policy,
      thresholds: { ...base.thresholds, ...(opts.policy.thresholds || {}) },
      gates: { ...base.gates, ...(opts.policy.gates || {}) },
    };
  }
  if (opts.mode) base.mode = normalizeMode(opts.mode);
  else base.mode = normalizeMode(base.mode);

  // Env override (never default to enforced via env alone without explicit value)
  const envMode = String(process.env.QUALITY_GATE_POLICY_MODE || '').trim().toLowerCase();
  if (MODES.includes(envMode) && !opts.mode) base.mode = envMode;

  return base;
}

/**
 * Build qualityMetadata (separate from generationMetadata).
 * @param {object} report — from runQualityGates
 * @param {{ checkedBy?: string, policyMode?: string }} [opts]
 */
function buildQualityMetadata(report, opts = {}) {
  const gateMap = {};
  for (const g of report.gates || []) {
    gateMap[g.name] = String(g.status || '').toLowerCase();
  }
  return {
    status: report.status || 'FAIL',
    checkedAt: report.generatedAt || new Date().toISOString(),
    checkedBy: opts.checkedBy || 'system',
    policyMode: opts.policyMode || report.policyMode || 'advisory',
    stagingStatus: report.stagingStatus || null,
    summary: report.summary || { errors: 0, warnings: 0 },
    gates: gateMap,
    // Do not embed full error lists here — keep report separately if needed
  };
}

/**
 * Decide whether a part may be promoted given a quality report + policy.
 *
 * advisory: always allowed
 * review: FAIL blocked; WARNING blocked until human override (manualReviewed)
 * enforced: FAIL blocked; WARNING allowed unless warningRequiresReview
 *
 * @param {object} qualityReport
 * @param {{ policy?: object, mode?: string, manualReviewed?: boolean, forceApprove?: boolean }} [opts]
 */
function canPromotePart(qualityReport, opts = {}) {
  const policy = loadQualityGatePolicy({
    policy: opts.policy,
    mode: opts.mode || qualityReport?.policyMode,
  });
  const mode = policy.mode;
  const status = String(qualityReport?.status || 'FAIL').toUpperCase();
  const reasons = [];

  if (opts.forceApprove === true) {
    return {
      allowed: true,
      reason: ['force_approve'],
      mode,
      status,
      overridden: true,
    };
  }

  if (mode === 'advisory') {
    return { allowed: true, reason: ['advisory_mode'], mode, status };
  }

  if (status === 'PASS') {
    return { allowed: true, reason: [], mode, status };
  }

  if (mode === 'review') {
    if (status === 'FAIL') {
      reasons.push('fail_blocks_in_review_mode');
      return { allowed: false, reason: reasons, mode, status };
    }
    if (status === 'WARNING') {
      if (opts.manualReviewed === true) {
        return { allowed: true, reason: ['manual_reviewed_warning'], mode, status };
      }
      if (policy.thresholds?.warningRequiresReview !== false) {
        reasons.push('warning_requires_human_review');
        return { allowed: false, reason: reasons, mode, status };
      }
    }
    return { allowed: true, reason: [], mode, status };
  }

  // enforced
  if (status === 'FAIL') {
    reasons.push('fail_blocks_in_enforced_mode');
    return { allowed: false, reason: reasons, mode, status };
  }
  if (status === 'WARNING' && policy.thresholds?.warningRequiresReview === true && !opts.manualReviewed) {
    reasons.push('warning_requires_human_review');
    return { allowed: false, reason: reasons, mode, status };
  }
  return { allowed: true, reason: [], mode, status };
}

/**
 * Build a part-shaped object from a staging candidate for quality gates.
 */
function partFromStagingCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const passages = [];
  if (Array.isArray(candidate.passages)) passages.push(...candidate.passages);
  else if (candidate.passage) passages.push(candidate.passage);
  return {
    id: candidate.id,
    module: candidate.module,
    teil: candidate.teil,
    level: candidate.level || 'B1',
    passages,
    questions: Array.isArray(candidate.questions) ? candidate.questions : [],
    generationMetadata: candidate.generationMetadata || null,
    qualityMetadata: candidate.qualityMetadata || null,
  };
}

module.exports = {
  MODES,
  DEFAULT_POLICY,
  POLICY_PATH,
  loadQualityGatePolicy,
  buildQualityMetadata,
  canPromotePart,
  partFromStagingCandidate,
  normalizeMode,
};
