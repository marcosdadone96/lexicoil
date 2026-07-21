/**
 * Tipos y utilidades compartidas para gates Q1/Q3/Q4.
 */

/** @typedef {{ rule: string, detail: string, span?: string, severity?: 'block'|'warn' }} QualityFinding */

/** @typedef {{ gate: string, file: string, verdict: 'pass'|'warn'|'block', findings: QualityFinding[] }} QualityGateVerdict */

/**
 * @param {string} gate
 * @param {string} file
 * @param {QualityFinding[]} findings
 * @returns {QualityGateVerdict}
 */
export function buildVerdict(gate, file, findings) {
  const hasBlock = findings.some((f) => (f.severity || 'block') === 'block');
  const hasWarn = findings.some((f) => f.severity === 'warn');
  const verdict = hasBlock ? 'block' : hasWarn ? 'warn' : 'pass';
  return { gate, file, verdict, findings };
}

/**
 * @param {QualityFinding[]} findings
 * @param {Partial<QualityFinding> & { rule: string, detail: string }} item
 */
export function pushFinding(findings, item) {
  findings.push({
    severity: item.severity || 'block',
    rule: item.rule,
    detail: item.detail,
    span: item.span,
  });
}

/**
 * @param {object} batch
 * @returns {number}
 */
export function inferTeil(batch) {
  const t = Number(batch?.teil);
  if (t >= 1 && t <= 5) return t;
  const q = batch?.questions?.[0];
  const qt = Number(q?.teil);
  return qt >= 1 && qt <= 5 ? qt : 0;
}
