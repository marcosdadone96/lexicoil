/**
 * sprechenPerspectiveGate.mjs — Deterministic gate: examiner-perspective leaks in Sprechen T3.
 *
 * Blocks 1st-person examiner voice («stelle ich…», «als Prüfer…») and official
 * «Kandidat/Kandidatin» when addressing the exam partner (must be Partner/Partnerin).
 *
 * Usable at promote/import (assertSprechenPerspectiveClean) and for retroactive pool scans.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

/** Examiner 1st person / Prüfer address / Kandidat* (any inflection). */
export const SPRECHEN_T3_PERSPECTIVE_RE =
  /stelle\s+ich|als\s+Prüfer(?:in)?|für\s+den\s+Prüfer|\bKandidat(?:en|in|innen)?\b/gi;

/**
 * @param {string} text
 * @returns {{ match: string, index: number }[]}
 */
export function findPerspectiveLeakMatches(text) {
  const src = String(text || '');
  const out = [];
  const re = new RegExp(SPRECHEN_T3_PERSPECTIVE_RE.source, SPRECHEN_T3_PERSPECTIVE_RE.flags);
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ match: m[0], index: m.index });
  }
  return out;
}

/**
 * Scan T3 question text of a Sprechen batch.
 * @param {object} batch
 * @returns {{ ok: boolean, findings: { teil: number, id?: string, match: string, index: number, snippet: string }[] }}
 */
export function checkSprechenPerspective(batch) {
  const findings = [];
  for (const q of batch?.questions || []) {
    if (Number(q?.teil) !== 3) continue;
    const text = String(q.question || '');
    for (const hit of findPerspectiveLeakMatches(text)) {
      const start = Math.max(0, hit.index - 40);
      const end = Math.min(text.length, hit.index + hit.match.length + 40);
      findings.push({
        teil: 3,
        id: q.id,
        match: hit.match,
        index: hit.index,
        snippet: text.slice(start, end).replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return { ok: findings.length === 0, findings };
}

/**
 * Gate for promote/import: block if T3 has examiner-perspective leaks.
 * @returns {{ ok: boolean, issue?: string, findings?: object[] }}
 */
export function assertSprechenPerspectiveClean(batch) {
  const result = checkSprechenPerspective(batch);
  if (result.ok) return { ok: true };
  const first = result.findings[0];
  return {
    ok: false,
    issue: `Sprechen T3 perspective leak: «${first.match}» in ${first.id || 'teil3'} — ${first.snippet}`,
    findings: result.findings,
  };
}

/**
 * Scan sprechen JSON files under a directory (default: pool-verified).
 * @param {string} [dir]
 * @returns {{ file: string, ok: boolean, findings: object[] }[]}
 */
export function scanSprechenPerspectiveDir(
  dir = path.join(ROOT, 'batches/ready/pool-verified'),
) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^sprechen/i.test(f) && f.endsWith('.json') && !f.startsWith('.'))
    .sort()
    .map((f) => {
      const abs = path.join(dir, f);
      let batch;
      try {
        batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
      } catch {
        return { file: f, ok: false, findings: [{ match: 'PARSE_ERROR', snippet: abs }] };
      }
      const result = checkSprechenPerspective(batch);
      return { file: f, ok: result.ok, findings: result.findings };
    });
}
