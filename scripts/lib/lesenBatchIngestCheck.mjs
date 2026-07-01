/**
 * Pre-flight ingest validation for Lesen batches (CEFR + structural).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnv.mjs';
import { batchToCandidates } from '../pipeline/lib/candidateBuilder.mjs';
import { validateCandidate, resolveBlueprint } from '../pipeline/lib/validateCandidate.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CefrGate = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));

export const DEFAULT_CEFR_MIN_COVERAGE = 0.55;

export function getCefrMinCoverage() {
  return CefrGate.COVERAGE_THRESHOLD;
}

/** Log once at generator/ingest CLI startup. */
export function logCefrCoverageThreshold() {
  const threshold = CefrGate.COVERAGE_THRESHOLD;
  const pct = Math.round(threshold * 1000) / 10;
  const envRaw = process.env.CEFR_MIN_COVERAGE;
  const fromEnv = envRaw != null && String(envRaw).trim() !== '';
  const source = fromEnv
    ? `CEFR_MIN_COVERAGE=${String(envRaw).trim()}`
    : `default ${DEFAULT_CEFR_MIN_COVERAGE}`;
  console.log(`Umbral cobertura CEFR (cefr_gate): ${pct}% (${source})`);
}

export function checkLesenBatchIngest(batch, { lang = 'de', level = 'B1', batchId = 'batch' } = {}) {
  const blueprint = resolveBlueprint(lang, level);
  const candidates = batchToCandidates(batch, {
    lang,
    level,
    blueprint,
    batchId,
    source: 'lesenBatchIngestCheck',
  });
  const results = candidates.map((candidate) => {
    const validation = validateCandidate(candidate, blueprint);
    return {
      teil: candidate.teil,
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      cefr: validation.cefr,
    };
  });
  return {
    ok: results.every((r) => r.valid),
    results,
  };
}

export function formatIngestReport(report) {
  const lines = [];
  if (report.ok) {
    lines.push('Ingest pre-check OK ✅');
  } else {
    lines.push('Ingest pre-check FAIL');
  }
  for (const r of report.results) {
    if (r.valid) {
      lines.push(`  T${r.teil}: OK`);
    } else {
      lines.push(`  T${r.teil}: ${r.errors.join('; ')}`);
    }
  }
  return lines.join('\n');
}
