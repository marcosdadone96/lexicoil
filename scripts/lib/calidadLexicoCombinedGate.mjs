/**
 * Calidad + léxico en un solo pase (Hören T1/T3/T4, Lesen T3/T4, …).
 */
import { checkLexical, formatLexicalReport } from './lexicalCheck.mjs';

export const COMBINED_CALIDAD_LEXICO_ISSUE_LIMIT = 12;

/**
 * @param {object} batch
 * @param {{ ok?: boolean, issues?: string[], report?: string }} quality
 * @param {{ level?: string }} [opts]
 */
export function collectCalidadLexicoIssues(batch, quality, opts = {}) {
  const calidadIssues = quality.ok ? [] : [...(quality.issues || [])];
  const lex = checkLexical(batch, { level: opts.level || batch?.level || 'B1' });
  const lexIssues = lex.ok ? [] : [...(lex.issues || [])];
  const issues = [...calidadIssues, ...lexIssues];
  return {
    ok: issues.length === 0,
    issues,
    calidadIssues,
    lexIssues,
    lex,
    report: `${quality.report || ''}${lexIssues.length ? `\n${formatLexicalReport(lex)}` : ''}`.trim(),
  };
}

/**
 * @param {object} combined — collectCalidadLexicoIssues result
 * @param {{ label?: string }} [meta]
 */
export function combinedCalidadLexicoGateResult(combined, meta = {}) {
  if (combined.ok) return { ok: true };
  const { issues, calidadIssues, lexIssues } = combined;
  const hasCal = calidadIssues.length > 0;
  const hasLex = lexIssues.length > 0;
  const gate = hasCal && hasLex ? 'calidad+lexico' : hasLex ? 'lexico' : 'calidad';
  const label = meta.label || 'combined';
  return {
    ok: false,
    gate,
    issue: issues[0],
    issues: issues.slice(0, COMBINED_CALIDAD_LEXICO_ISSUE_LIMIT),
    detail: combined.report,
    combinedCalidadLexico: true,
    combinedLabel: label,
  };
}
