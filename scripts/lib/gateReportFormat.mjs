/**
 * gateReportFormat.mjs — mensajes de fallo de gates con detalle (métrica + valor + umbral).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CefrGate = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));

const COMPLEXITY = CefrGate.COMPLEXITY || {};
const INFERENCE_BANDS = CefrGate.INFERENCE_BANDS || {};

function parseKvParams(tail) {
  const out = {};
  for (const part of String(tail || '').split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** Convierte cefr_gate:reason:kv… en línea legible con rango. */
export function formatCefrGateError(raw, level = 'B1') {
  const lv = String(level || 'B1').toUpperCase();
  const cx = COMPLEXITY[lv] || COMPLEXITY.B1 || { minAvg: 10, maxAvg: 22, minSub: 4, maxSub: 45 };
  const band = INFERENCE_BANDS[lv] || INFERENCE_BANDS.B1 || { maxInference: 0.35 };
  const covMin = Math.round((CefrGate.getCoverageThreshold?.() ?? CefrGate.COVERAGE_THRESHOLD ?? 0.55) * 1000) / 10;

  let s = String(raw || '').trim();
  if (s.startsWith('cefr_gate:')) s = s.slice('cefr_gate:'.length);

  const colon = s.indexOf(':');
  const key = colon >= 0 ? s.slice(0, colon) : s;
  const params = colon >= 0 ? parseKvParams(s.slice(colon + 1)) : {};

  switch (key) {
    case 'subordinate_too_few':
      return `subordinate_too_few: subordinatePct=${params.subordinatePct ?? '?'}, rango=[${cx.minSub},${cx.maxSub}]`;
    case 'subordinate_too_many':
      return `subordinate_too_many: subordinatePct=${params.subordinatePct ?? '?'}, rango=[${cx.minSub},${cx.maxSub}]`;
    case 'complexity_too_simple':
      return `complexity_too_simple: avgSentenceLen=${params.avgSentenceLen ?? '?'}, rango=[${cx.minAvg},${cx.maxAvg}]`;
    case 'complexity_too_complex':
      return `complexity_too_complex: avgSentenceLen=${params.avgSentenceLen ?? '?'}, rango=[${cx.minAvg},${cx.maxAvg}]`;
    case 'coverage_below_threshold':
      return `coverage_below_threshold: coverageVsLevel=${String(params.coverage ?? '?').replace(/%$/, '')}%, mín=${String(params.min ?? covMin).replace(/%$/, '')}%`;
    case 'length_below_min':
      return `length_below_min: wordCount=${params.wordCount ?? '?'}, mín=${params.min ?? '?'}`;
    case 'length_above_max':
      return `length_above_max: wordCount=${params.wordCount ?? '?'}, máx=${params.max ?? '?'}`;
    case 'inference_above_max':
      return `inference_above_max: inferencePct=${params.inferencePct ?? '?'}, máx=${params.max ?? (band.maxInference * 100) + '%'}`;
    case 'inference_below_min':
      return `inference_below_min: inferencePct=${params.inferencePct ?? '?'}, mín=${params.min ?? '?'}`;
    case 'passage_text_missing':
      return 'passage_text_missing: sin texto de pasaje medible para CEFR';
    default:
      return s.includes(':') ? s : `${key}: ${JSON.stringify(params)}`;
  }
}

/** Errores legibles desde report de checkLesenBatchIngest. */
export function extractIngestErrors(report, level = 'B1') {
  const out = [];
  for (const r of report?.results || []) {
    if (r.valid) continue;
    const errs = r.errors?.length ? r.errors : (r.cefr?.reasons || []);
    for (const e of errs) {
      out.push(formatCefrGateError(e, level));
    }
    if (!errs.length) out.push('pre-ingest-cefr: fallo sin detalle (revisar validateCandidate)');
  }
  return out;
}

/** Métricas CEFR para tabla de resumen. */
export function formatCefrMetricsSummary(cefr, level = 'B1') {
  if (!cefr?.metrics) return [];
  const lv = String(level || 'B1').toUpperCase();
  const cx = COMPLEXITY[lv] || COMPLEXITY.B1;
  const covMin = Math.round((CefrGate.getCoverageThreshold?.() ?? 0.55) * 1000) / 10;
  const m = cefr.metrics;
  const band = INFERENCE_BANDS[lv] || {};
  const lines = [];
  if (m.wordCount != null) {
    const bounds = m.lengthBounds || {};
    lines.push(`  wordCount=${m.wordCount} (mín ${bounds.min ?? '?'})`);
  }
  if (m.avgSentenceLen != null) {
    lines.push(`  avgSentenceLen=${m.avgSentenceLen} (rango [${cx.minAvg},${cx.maxAvg}])`);
  }
  if (m.subordinatePct != null) {
    lines.push(`  subordinatePct=${m.subordinatePct} (rango [${cx.minSub},${cx.maxSub}])`);
  }
  if (m.coverageVsLevel != null) {
    lines.push(`  coverageVsLevel=${m.coverageVsLevel}% (mín ${covMin}%)`);
  }
  if (m.inferencePct != null && band.maxInference != null) {
    lines.push(`  inferencePct=${m.inferencePct}% (máx ${band.maxInference * 100}%)`);
  }
  return lines;
}

export function parseValidateBatchErrors(output) {
  const lines = String(output || '').split('\n');
  const problems = [];
  let inProblems = false;
  for (const line of lines) {
    if (/^Problemas:/i.test(line)) {
      inProblems = true;
      continue;
    }
    if (inProblems) {
      const m = line.match(/^\s*-\s*(.+)$/);
      if (m) problems.push(m[1].trim());
    }
    if (/Colocación.*NINGUNA/i.test(line)) {
      problems.push('Colocación blueprint: ninguna Teil mejorada (revisa type/teil/passageId)');
    }
    if (/Conformidad blueprint:\s*FAIL/i.test(line)) {
      const itemLine = lines.find((l) => l.includes(':') && !l.startsWith('Conformidad'));
      if (itemLine && !problems.some((p) => p.includes('Conformidad'))) {
        problems.push(`Conformidad blueprint: ${itemLine.trim()}`);
      } else if (!problems.some((p) => p.includes('Conformidad'))) {
        problems.push('Conformidad blueprint: FAIL');
      }
    }
    if (/Esquema:\s*ERR/i.test(line)) {
      problems.push(`Esquema JSON: ${line.replace(/^Esquema:\s*/i, '').trim()}`);
    }
  }
  if (problems.length) return problems;
  const tail = lines.filter((l) => l.trim()).slice(-4).join(' · ');
  return tail ? [tail.slice(0, 240)] : ['Validación técnica falló (sin detalle en salida validate-batch)'];
}

export function parseSweepBlacklistErrors(output) {
  const hits = [];
  for (const line of String(output || '').split('\n')) {
    const m = line.match(/\[(C1\/C2|GRAM)\]\s+"([^"]+)"\s+→\s+(.+?)\s+\(([^)]+)\)/);
    if (m) hits.push(`[${m[1]}] "${m[2]}" → ${m[3]} (${m[4]})`);
  }
  return hits.length ? hits : ['Vocabulario C1/C2 encontrado (ejecuta sweep-blacklist.mjs para detalle)'];
}

const AUDIT_SEV = { CRITICAL: 3, IMPORTANT: 2, MINOR: 1, INFO: 0 };

export function parseAuditPass2Errors(output, failOn = 'IMPORTANT') {
  let payload;
  try {
    payload = JSON.parse(output);
  } catch (_) {
    const lines = String(output || '').split('\n').filter((l) => l.includes('IMPORTANT') || l.includes('CRITICAL'));
    return lines.length ? lines.slice(0, 8) : ['Auditoría pedagógica falló (salida audit-pass-2 no parseable)'];
  }
  const failLevel = AUDIT_SEV[failOn] ?? AUDIT_SEV.IMPORTANT;
  return (payload.findings || [])
    .filter((f) => (AUDIT_SEV[f.severity] ?? 0) >= failLevel)
    .slice(0, 12)
    .map((f) => `${f.id} [${f.severity}]: ${f.message}${f.scope ? ` (${f.scope})` : ''}`);
}
