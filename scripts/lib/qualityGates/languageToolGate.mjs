/**
 * languageToolGate.mjs — advisory LanguageTool layer (Docker erikvl87/languagetool).
 *
 * Policy (2026-07-12):
 *   - Generation: ALWAYS advisory. If LT is down → soft-skip (never blocks gen).
 *   - Periodic: `npm run audit:languagetool` over pool-verified (blocking only as
 *     operator review signal in the JSON report, not in the generator).
 *   - Noise rules (WHITESPACE, typography/colloquial) are filtered out of findings.
 *
 * Does NOT auto-correct text. Date/weekday mismatches also stay in dateWeekdayGate
 * (deterministic, no Docker).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';

export const LANGUAGE_TOOL_GATE_VERSION = 'v1.0-advisory-2026-07-12';

/** Rules treated as noise / style — excluded from advisory findings & MUST_CATCH live checks. */
export const LT_NOISE_RULE_IDS = new Set([
  'WHITESPACE_RULE',
  'AUSLASSUNGSPUNKTE_LEERZEICHEN',
  'EINHEIT_LEERZEICHEN',
  'H2O',
  'MATHE',
  'DRAUF',
  'RAN_RUM_RAUF_REIN_RAUS_RUNTER_NEU',
  'SCHEISS_HAMMER_RIESEN',
  'DE_SIMPLE_REPLACE_COMMUNITIES',
]);

const DEFAULT_BASE = String(process.env.LT_BASE || 'http://127.0.0.1:8010').replace(/\/$/, '');

/**
 * @param {object} match — LT API match
 * @returns {boolean} true if this match should surface as a real finding
 */
export function isRealLanguageToolMatch(match) {
  const ruleId = match?.ruleId || match?.rule?.id || '';
  if (!ruleId || LT_NOISE_RULE_IDS.has(ruleId)) return false;
  return true;
}

export async function pingLanguageTool(base = DEFAULT_BASE, { timeoutMs = 2500 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/v2/languages`, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, base };
    const langs = await res.json();
    return { ok: true, base, languageCount: Array.isArray(langs) ? langs.length : 0 };
  } catch (err) {
    return { ok: false, reason: err?.message || String(err), base };
  } finally {
    clearTimeout(t);
  }
}

export async function checkTextWithLanguageTool(text, opts = {}) {
  const base = opts.base || DEFAULT_BASE;
  const language = opts.language || 'de-DE';
  const body = new URLSearchParams({ language, text: String(text || '') });
  const res = await fetch(`${base}/v2/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LT HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const matches = (data.matches || []).map((m) => ({
    ruleId: m.rule?.id || '',
    category: m.rule?.category?.id || '',
    message: m.message || '',
    offset: m.offset,
    length: m.length,
    context: m.context?.text || '',
  }));
  return {
    matches,
    realMatches: matches.filter(isRealLanguageToolMatch),
  };
}

function extractPassageTexts(batch) {
  const out = [];
  if (batch?.passage?.text && String(batch.passage.text).trim()) {
    out.push({ passageIndex: 'passage', text: String(batch.passage.text) });
  }
  if (Array.isArray(batch?.passages)) {
    batch.passages.forEach((p, i) => {
      const t = p?.text != null ? String(p.text) : '';
      if (t.trim()) out.push({ passageIndex: i, text: t });
    });
  }
  return out;
}

/**
 * Advisory gate over batch passage.text fields.
 * Never throws for LT-down; returns { skipped: true }.
 *
 * @returns {Promise<{
 *   gate: string,
 *   version: string,
 *   skipped: boolean,
 *   skipReason?: string,
 *   verdict: 'pass'|'warn'|'skip',
 *   findings: object[],
 * }>}
 */
export async function runLanguageToolAdvisoryGate(batch, opts = {}) {
  const file = opts.file || '';
  const base = opts.base || DEFAULT_BASE;
  const delayMs = Number(opts.delayMs ?? process.env.LT_DELAY_MS ?? 80);

  const ping = await pingLanguageTool(base);
  if (!ping.ok) {
    return {
      gate: 'languageToolAdvisory',
      version: LANGUAGE_TOOL_GATE_VERSION,
      skipped: true,
      skipReason: ping.reason || 'unreachable',
      base,
      verdict: 'skip',
      findings: [],
      mode: 'advisory',
    };
  }

  const findings = [];
  const passages = extractPassageTexts(batch);
  for (const pass of passages) {
    try {
      const { realMatches } = await checkTextWithLanguageTool(pass.text, {
        base,
        language: opts.language,
      });
      for (const m of realMatches) {
        findings.push({
          rule: 'languagetool',
          ruleId: m.ruleId,
          severity: 'warn',
          passageIndex: pass.passageIndex,
          span: pass.text.slice(m.offset, m.offset + m.length),
          offset: m.offset,
          length: m.length,
          detail: m.message,
          context: m.context,
          file,
        });
      }
    } catch (err) {
      findings.push({
        rule: 'languagetool_error',
        severity: 'warn',
        detail: err?.message || String(err),
        file,
        passageIndex: pass.passageIndex,
      });
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  return {
    gate: 'languageToolAdvisory',
    version: LANGUAGE_TOOL_GATE_VERSION,
    skipped: false,
    base,
    verdict: findings.length ? 'warn' : 'pass',
    findings,
    mode: 'advisory',
    passageCount: passages.length,
  };
}

/**
 * Append advisory result to gate-logs JSONL (best-effort).
 */
export function logLanguageToolAdvisory(verdict, opts = {}) {
  try {
    const dir = path.join(ROOT, 'batches/ready/gate-logs');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(dir, `audit-LT-advisory-${stamp}.jsonl`);
    fs.appendFileSync(file, `${JSON.stringify({ ...verdict, loggedAt: new Date().toISOString(), ...opts })}\n`);
  } catch {
    /* ignore log failures */
  }
}
