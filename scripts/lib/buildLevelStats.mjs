/**
 * Audit + cost tracking for scripts/build-level.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { auditDir, comboKey, listCuratedFiles, ROOT } from './examPipeline.mjs';
import { spentUSD } from './costMeter.mjs';

const GEMINI_USAGE = path.join(ROOT, 'batches', '.gemini-usage.json');

export function buildAuditPath(lang, level) {
  return path.join(auditDir(), `build-${comboKey(lang, level)}.json`);
}

export function defaultAudit(lang, level, target) {
  return {
    lang,
    level,
    target,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phases: {},
    stats: {
      gemini: { batchesOK: 0, batchesFail: 0, ingestAccepted: 0, ingestRejected: 0, estimatedUSD: 0 },
      pool: { fillActions: 0, examsTouched: 0, residualGaps: 0 },
      claude: { partsAccepted: 0, partsFailed: 0, estimatedUSD: 0 },
      curated: { count: 0, fidelityPassed: 0, fidelityFailed: 0 },
    },
    rounds: [],
  };
}

export function loadAudit(lang, level) {
  const p = buildAuditPath(lang, level);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function saveAudit(audit) {
  audit.updatedAt = new Date().toISOString();
  const p = buildAuditPath(audit.lang, audit.level);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  return p;
}

export function curatedCount(lang, level) {
  return listCuratedFiles(lang, level).length;
}

function readGeminiUsageCount() {
  try {
    if (!fs.existsSync(GEMINI_USAGE)) return 0;
    const raw = JSON.parse(fs.readFileSync(GEMINI_USAGE, 'utf8'));
    return Number(raw.count) || 0;
  } catch {
    return 0;
  }
}

/** Rough Gemini Flash cost per generation job (batch). */
export function estimateGeminiUSD(requestCount) {
  const perReq = Number(process.env.GEMINI_EST_USD_PER_REQ || 0.012);
  return Math.round(requestCount * perReq * 10000) / 10000;
}

export function costSnapshot() {
  return {
    claudeUSD: spentUSD(),
    geminiRequests: readGeminiUsageCount(),
    at: new Date().toISOString(),
  };
}

export function costDelta(before, after) {
  return {
    claudeUSD: Math.max(0, (after.claudeUSD || 0) - (before.claudeUSD || 0)),
    geminiRequests: Math.max(0, (after.geminiRequests || 0) - (before.geminiRequests || 0)),
    geminiUSD: estimateGeminiUSD(
      Math.max(0, (after.geminiRequests || 0) - (before.geminiRequests || 0)),
    ),
  };
}

export function markPhase(audit, name, extra = {}) {
  audit.phases[name] = { done: true, at: new Date().toISOString(), ...extra };
}

export function phaseDone(audit, name) {
  return audit?.phases?.[name]?.done === true;
}
