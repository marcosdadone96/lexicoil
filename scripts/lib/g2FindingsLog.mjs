/**
 * g2FindingsLog.mjs — persistent G2 (pos-caps-check) findings log.
 * Detection only; fixes go through human review → capitalizeNouns.mjs lists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import { checkGermanCapsBatch } from './germanCapsGate.mjs';

export const G2_FINDINGS_LOG = path.join(ROOT, 'batches/ready/gate-logs/g2-findings-log.jsonl');
export const G2_GATE_VERSION = 'v6.1-B-G2';

function ensureLogDir() {
  fs.mkdirSync(path.dirname(G2_FINDINGS_LOG), { recursive: true });
}

/**
 * Append one JSONL record per batch check (including zero findings).
 * @param {object} batch
 * @param {object} [opts]
 * @param {object} [opts.capsResult] — reuse result from checkGermanCapsBatch
 * @param {string} [opts.file] — relative path e.g. batches/generated/…
 * @param {number} [opts.teil]
 */
export function appendG2FindingsLog(batch, opts = {}) {
  const caps = opts.capsResult || checkGermanCapsBatch(batch);
  const entry = {
    ts: new Date().toISOString(),
    file: opts.file || '',
    teil: opts.teil ?? batch?.passages?.[0]?.teil ?? batch?.questions?.[0]?.teil ?? null,
    findingCount: caps.findings?.length || 0,
    skipped: Boolean(caps.skipped),
    skipReason: caps.warnings?.[0] || null,
    findings: (caps.findings || []).map((f) => ({
      word: f.word,
      type: f.type,
      reason: f.reason,
      field: f.field,
      context: String(f.context || '').slice(0, 200),
      tag: f.tag,
      pos: f.pos,
    })),
    gate: G2_GATE_VERSION,
    mode: 'warn',
  };
  ensureLogDir();
  fs.appendFileSync(G2_FINDINGS_LOG, `${JSON.stringify(entry)}\n`, 'utf8');
  return entry;
}
