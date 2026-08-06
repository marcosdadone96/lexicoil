/**
 * germanCapsGate.mjs — spaCy POS capitalization gate (offline, bulk).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyTextRegime } from './textRegime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PY_SCRIPT = path.join(ROOT, 'scripts', 'pos-caps-check.py');
const DEFAULT_TIMEOUT_MS = 120_000;
const BULK_CHUNK = 400;

const SKIP_FIELDS = new Set(['passages.title']);

function collectStringsFromBatch(batch) {
  const items = [];
  const push = (field, text) => {
    if (typeof text !== 'string' || !text.trim()) return;
    if (SKIP_FIELDS.has(field)) return;
    items.push({ field, text });
  };

  for (const p of batch.passages || []) {
    push('passages.text', p.text);
    if (Array.isArray(p.ads)) for (const ad of p.ads) push('passages.ads', ad);
  }
  for (const q of batch.questions || []) {
    push('questions.question', q.question);
    push('questions.signText', q.signText);
    push('questions.explanation', q.explanation);
    push('questions.statement', q.statement);
    if (Array.isArray(q.matchLabels)) {
      for (const l of q.matchLabels) push('questions.matchLabels', l);
    }
    for (const opt of q.options || []) {
      if (typeof opt === 'string') push('questions.options', opt);
      else if (opt?.text) push('questions.options', opt.text);
    }
  }
  return items;
}

function resolvePythonBin() {
  // Explicit override always wins (manual PATH / CI / alternate venv).
  if (process.env.POS_CHECK_PYTHON) return process.env.POS_CHECK_PYTHON;
  // Prefer project venv (same pattern as pilot-holdout-caps-validation.mjs).
  const venvPy =
    process.platform === 'win32'
      ? path.join(ROOT, '.venv-pos-check', 'Scripts', 'python.exe')
      : path.join(ROOT, '.venv-pos-check', 'bin', 'python');
  if (fs.existsSync(venvPy)) return venvPy;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function spawnPosCheck(payload, timeoutMs) {
  const py = resolvePythonBin();
  const proc = spawnSync(py, [PY_SCRIPT], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 30 * 1024 * 1024,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  if (proc.error) {
    return { ok: false, skipped: true, warning: proc.error.message, findings: [] };
  }
  if (proc.status !== 0) {
    return {
      ok: false,
      skipped: true,
      warning: proc.stderr?.trim() || `python exit ${proc.status}`,
      findings: [],
    };
  }
  try {
    const parsed = JSON.parse(proc.stdout || '{}');
    if (!parsed.ok) {
      return {
        ok: false,
        skipped: true,
        warning: parsed.error || 'pos_check_unavailable',
        findings: [],
      };
    }
    return { ok: true, skipped: false, findings: parsed.findings || [], observations: parsed.observations || [] };
  } catch (err) {
    return { ok: false, skipped: true, warning: err.message, findings: [] };
  }
}

/** Run gate on plain texts (with optional parallel fields array). */
export function runPosCapsCheck(texts, opts = {}) {
  const fields = opts.fields || texts.map(() => '');
  return spawnPosCheck({ texts, fields }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

/**
 * Bulk gate: one Python process per chunk. Items: { id?, field, text }.
 */
export function runPosCapsBulk(items, opts = {}) {
  if (!items?.length) return { ok: true, skipped: false, findings: [], observations: [] };
  const chunkSize = opts.chunkSize ?? BULK_CHUNK;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const all = [];
  const allObs = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const slice = items.slice(i, i + chunkSize).map((it) => {
      const { regime, signals } = classifyTextRegime({
        text: it.text,
        field: it.field || '',
        file: it.file || '',
      });
      return {
        id: it.id,
        field: it.field || '',
        text: it.text,
        file: it.file || '',
        regime,
        regimeSignals: signals,
      };
    });
    const result = spawnPosCheck({ items: slice }, timeoutMs);
    if (result.skipped) return result;
    all.push(...(result.findings || []));
    allObs.push(...(result.observations || []));
  }
  return { ok: true, skipped: false, findings: all, observations: allObs };
}

export function checkGermanCapsBatch(batch, opts = {}) {
  const fields = collectStringsFromBatch(batch);
  if (!fields.length) return { ok: true, skipped: false, findings: [], warnings: [] };
  const items = fields.map((f, i) => ({ id: String(i), ...f }));
  const result = runPosCapsBulk(items, opts);
  if (result.skipped) {
    return {
      ok: true,
      skipped: true,
      findings: [],
      warnings: [`POS caps gate skipped: ${result.warning}`],
    };
  }
  const idToMeta = new Map(items.map((it) => [it.id, it]));
  const findings = (result.findings || []).map((f) => {
    const meta = idToMeta.get(String(f.id)) || fields[f.textIndex] || { field: 'text' };
    return { ...f, field: f.field || meta.field, text: meta.text };
  });
  return { ok: findings.length === 0, skipped: false, findings, warnings: [] };
}

export function formatGermanCapsFinding(f) {
  const ctx = String(f.context || f.text || '').slice(0, 120);
  const conf = f.confidence ? ` [${f.confidence}]` : '';
  return `${f.type}: «${f.word}» (${f.tag || f.pos || '?'})${conf} en ${f.field} — …${ctx}…`;
}

export function formatGermanCapsIssues(result) {
  return (result.findings || []).map(formatGermanCapsFinding);
}

/** Collect all text fields from a directory of batch JSON files (bulk calibration/repair). */
export function collectBatchItemsFromDir(dir, fileFilter = () => true) {
  const items = [];
  if (!fs.existsSync(dir)) return items;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    if (!fileFilter(name)) continue;
    try {
      const batch = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      for (const { field, text } of collectStringsFromBatch(batch)) {
        items.push({ id: `${name}::${field}::${items.length}`, file: name, field, text });
      }
    } catch {
      /* skip corrupt */
    }
  }
  return items;
}

export { collectStringsFromBatch, SKIP_FIELDS };
