/**
 * Pre-flight ingest validation for Hören batches (CEFR + A2 register).
 * Lesen uses length+complexity via validateCandidate; Hören blueprint only lengthOnly —
 * this module runs full CefrGate.validatePassage per transcript + A2 register heuristics.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnv.mjs';
import { batchToCandidates } from '../pipeline/lib/candidateBuilder.mjs';
import { validateCandidate, resolveBlueprint } from '../pipeline/lib/validateCandidate.mjs';
import {
  extractIngestErrors,
  formatCefrGateError,
  formatCefrMetricsSummary,
} from './gateReportFormat.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CefrGate = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));

/** Word bounds aligned with EXAM_LENGTH_RULES.horen.A2 in examTemplatePrompt.mjs */
const HOREN_A2_LENGTH = {
  1: { min: 15, max: 80 },
  2: { min: 70, max: 160 },
  3: { min: 12, max: 55 },
  4: { min: 140, max: 260 },
};

export { logCefrCoverageThreshold, getCefrMinCoverage } from './lesenBatchIngestCheck.mjs';

/** B1 register leaked into A2 Hören (from external review + pool audit). */
export const A2_HOREN_B1_REGISTER_RE =
  /\b(Herausforderung|Experte(?:n|n)?\s+f[uü]r|digitale\s+Kommunikation|Einblicke|herzlich\s+willkommen\s+zu\s+unserer\s+Sendung|Beratungsgespr[aä]che|Vorstellungsgespr[aä]ch|Personalabteilung|Arbeitssuchende|kritisch\s+zu\s+sein|beeinflussen)\b/i;

const ZU_INFINITIV_RE = /\b[A-Za-zäöüÄÖÜß]+(?:en|ern|eln|n)?\s+zu\s+[A-Za-zäöüÄÖÜß]+/gi;

/** Max zu-Infinitiv constructions per passage / whole batch by teil. */
const ZU_INF_LIMITS = {
  1: { perPassage: 1, total: 3 },
  2: { perPassage: 2, total: 2 },
  3: { perPassage: 1, total: 3 },
  4: { perPassage: 3, total: 3 },
};

function lengthBoundsForTeil(teil, level = 'A2') {
  if (String(level).toUpperCase() !== 'A2') return { min: 0, max: 9999 };
  const r = HOREN_A2_LENGTH[Number(teil)];
  if (!r) return { min: 0, max: 9999 };
  return { min: r.min, max: r.max };
}

function countZuInfinitiv(text) {
  return (String(text || '').match(ZU_INFINITIV_RE) || []).length;
}

export function checkHorenA2Register(batch, teil) {
  const errors = [];
  const t = Number(teil ?? batch.passages?.[0]?.teil ?? batch.questions?.[0]?.teil);
  const limits = ZU_INF_LIMITS[t] || { perPassage: 2, total: 4 };
  let totalZu = 0;
  const passages = batch.passages || [];

  for (const p of passages) {
    const text = p.text || p.transcript || '';
    totalZu += countZuInfinitiv(text);
    const zuHere = countZuInfinitiv(text);
    if (zuHere > limits.perPassage) {
      errors.push(
        `register_gate:zu_infinitiv_density:passage ${p.id || '?'} has ${zuHere} (max ${limits.perPassage} for T${t})`,
      );
    }
    const b1Hit = text.match(A2_HOREN_B1_REGISTER_RE);
    if (b1Hit) {
      errors.push(
        `register_gate:b1_vocab:passage ${p.id || '?'} contains «${b1Hit[0]}» (A2 Hören — use simpler Alltagssprache)`,
      );
    }
  }

  if (totalZu > limits.total) {
    errors.push(
      `register_gate:zu_infinitiv_total:T${t} has ${totalZu} zu-Infinitiv (max ${limits.total})`,
    );
  }

  return { ok: errors.length === 0, errors };
}

function cefrPassageChecks(batch, { lang, level, teil }) {
  const errors = [];
  const metrics = [];
  const bounds = lengthBoundsForTeil(teil, level);

  for (const p of batch.passages || []) {
    const text = p.text || p.transcript || '';
    if (!text.trim()) {
      errors.push(`passage ${p.id || '?'}: empty transcript`);
      continue;
    }
    const result = CefrGate.validatePassage(text, {
      level,
      lang,
      lengthBounds: bounds,
    });
    metrics.push({ passageId: p.id, ...result.metrics, reasons: result.reasons, withinRange: result.withinRange });
    if (!result.withinRange) {
      for (const r of result.reasons || []) {
        errors.push(`passage ${p.id || '?'}: cefr_gate:${r}`);
      }
    }
  }
  return { errors, metrics };
}

export function checkHorenBatchIngest(batch, { lang = 'de', level = 'B1', batchId = 'batch', teil = null } = {}) {
  const lv = String(level || batch.level || 'B1').toUpperCase();
  const t = Number(teil ?? batch.passages?.[0]?.teil ?? batch.questions?.[0]?.teil ?? 0);
  const blueprint = resolveBlueprint(lang, lv);
  const candidates = batchToCandidates(batch, {
    lang,
    level: lv,
    blueprint,
    batchId,
    source: 'horenBatchIngestCheck',
  });

  const results = candidates.map((candidate) => {
    const validation = validateCandidate(candidate, blueprint);
    const errors = [...(validation.errors || [])];
    const warnings = [...(validation.warnings || [])];
    let cefrPassage = { errors: [], metrics: [] };
    let register = { ok: true, errors: [] };

    if (lv === 'A2' && candidate.module === 'horen') {
      cefrPassage = cefrPassageChecks(batch, { lang, level: lv, teil: candidate.teil ?? t });
      errors.push(...cefrPassage.errors);
      register = checkHorenA2Register(batch, candidate.teil ?? t);
      errors.push(...register.errors);
    }

    return {
      teil: candidate.teil,
      valid: errors.length === 0,
      errors,
      warnings,
      cefr: validation.cefr,
      cefrPassage: cefrPassage.metrics,
      register,
    };
  });

  if (!results.length && lv === 'A2') {
    const cefrPassage = cefrPassageChecks(batch, { lang, level: lv, teil: t });
    const register = checkHorenA2Register(batch, t);
    const errors = [...cefrPassage.errors, ...register.errors];
    results.push({
      teil: t,
      valid: errors.length === 0,
      errors,
      warnings: [],
      cefr: null,
      cefrPassage: cefrPassage.metrics,
      register,
    });
  }

  return {
    ok: results.every((r) => r.valid),
    results,
  };
}

export function formatHorenIngestReport(report, { level = 'B1' } = {}) {
  const lines = [];
  if (report.ok) {
    lines.push('Hören ingest pre-check OK ✅');
  } else {
    lines.push('Hören ingest pre-check FAIL');
  }
  for (const r of report.results) {
    if (r.valid) {
      lines.push(`  T${r.teil}: OK`);
      continue;
    }
    const detailed = r.errors?.length ? r.errors : extractIngestErrors({ results: [r] }, level);
    lines.push(`  T${r.teil}: ${(detailed || []).join('; ')}`);
    const metricLines = formatCefrMetricsSummary(r.cefr, level);
    for (const ml of metricLines) lines.push(ml);
    if (r.cefrPassage?.length) {
      for (const m of r.cefrPassage.filter((x) => !x.withinRange).slice(0, 3)) {
        lines.push(
          `    · ${m.passageId}: avgLen=${m.avgSentenceLen} subPct=${m.subordinatePct}% cov=${m.coverageVsLevel}%`,
        );
      }
    }
  }
  return lines.join('\n');
}

export { formatCefrGateError, extractIngestErrors, formatCefrMetricsSummary };
