/**
 * schreibenPlaceholderGate.mjs — reject unresolved [Name]/[…] placeholders in consignas.
 * SCH-1 (2026-07-10) fixed schreiben-gemini-005 manually; this gate prevents regression.
 */

/** Patterns that must never ship in question text. */
export const SCHREIBEN_PLACEHOLDER_RES = [
  /\[\s*Name\s+des\s+Freundes[^\]]*\]/i,
  /\[\s*Dein\s+Name\s*\]/i,
  /\[\s*Name\s*\]/i,
  /Liebe\/r\s+\[/i,
  /\[(?:Vorname|Nachname|Ihr(?:e(?:r|n))?\s+Name)[^\]]*\]/i,
];

/**
 * @param {string} text
 * @returns {string[]} matched placeholder literals
 */
export function findUnresolvedSchreibenPlaceholders(text) {
  const t = String(text || '');
  const hits = new Set();
  for (const re of SCHREIBEN_PLACEHOLDER_RES) {
    const m = t.match(re);
    if (m) hits.add(m[0]);
  }
  for (const m of t.matchAll(/\[[^\]]{2,80}\]/g)) {
    hits.add(m[0]);
  }
  return [...hits];
}

/**
 * @param {object} batch
 * @returns {{ ok: boolean, issues: string[] }}
 */
export function assertSchreibenNoPlaceholders(batch) {
  const issues = [];
  for (const q of batch?.questions || []) {
    if (q.module && String(q.module).toLowerCase() !== 'schreiben') continue;
    const hits = findUnresolvedSchreibenPlaceholders(q.question);
    if (!hits.length) continue;
    const teil = q.teil != null ? q.teil : '?';
    issues.push(
      `Schreiben T${teil}: placeholder sin resolver (${hits.slice(0, 2).join(', ')}) — usa destinatario concreto o deja que el alumno escriba Anrede/Gruß`,
    );
  }
  return { ok: issues.length === 0, issues };
}
